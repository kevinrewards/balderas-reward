-- Install only; this migration does not delete businesses or accounts.
BEGIN;

-- Durable account cleanup queue. Rows remain after completion to prevent relinking
-- an account while Auth deletion is in progress or after it has been retired.
CREATE TABLE IF NOT EXISTS public.admin_account_retirements (
  user_id uuid PRIMARY KEY,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.admin_account_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_account_retirements FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.admin_account_retirements TO service_role;

CREATE OR REPLACE FUNCTION public.guard_retired_account_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_account_retirements WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Esta cuenta fue retirada; utiliza una cuenta nueva.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_retired_account_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_retired_member ON public.business_members;
CREATE TRIGGER guard_retired_member BEFORE INSERT OR UPDATE ON public.business_members
FOR EACH ROW EXECUTE FUNCTION public.guard_retired_account_link();
DROP TRIGGER IF EXISTS guard_retired_admin ON public.platform_admins;
CREATE TRIGGER guard_retired_admin BEFORE INSERT OR UPDATE ON public.platform_admins
FOR EACH ROW EXECUTE FUNCTION public.guard_retired_account_link();
DROP TRIGGER IF EXISTS guard_retired_customer ON public.customers;
CREATE TRIGGER guard_retired_customer BEFORE INSERT OR UPDATE OF user_id ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.guard_retired_account_link();

CREATE OR REPLACE FUNCTION public.admin_lifecycle_preview(target_business_id uuid, target_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.businesses%ROWTYPE; result jsonb;
BEGIN
  IF NOT COALESCE(public.is_platform_admin(), false) THEN RAISE EXCEPTION 'Solo Superadmin.'; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = target_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El negocio ya no existe.'; END IF;
  IF target_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.business_members WHERE business_id = b.id AND user_id = target_user_id AND role = 'owner'
  ) THEN RAISE EXCEPTION 'El Owner ya no está vinculado a este negocio.'; END IF;
  SELECT jsonb_build_object(
    'business_id', b.id, 'business_name', b.name,
    'customers', (SELECT count(*) FROM public.customers WHERE business_id = b.id),
    'rewards', (SELECT count(*) FROM public.rewards WHERE business_id = b.id),
    'visits', (SELECT count(*) FROM public.visits WHERE business_id = b.id),
    'redemptions', (SELECT count(*) FROM public.redemptions WHERE business_id = b.id),
    'members', (SELECT count(*) FROM public.business_members WHERE business_id = b.id),
    'owners', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'user_id', m.user_id, 'active', m.active,
      'protected', EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = m.user_id),
      'other_links', (SELECT count(*) FROM public.business_members x WHERE x.user_id = m.user_id AND x.business_id <> b.id),
      'customer_links', (SELECT count(*) FROM public.customers c WHERE c.user_id = m.user_id
        AND (target_user_id IS NOT NULL OR c.business_id <> b.id))
    ) ORDER BY m.user_id) FROM public.business_members m WHERE m.business_id = b.id AND m.role = 'owner'
      AND (target_user_id IS NULL OR m.user_id = target_user_id)), '[]'::jsonb)
  ) INTO result;
  RETURN result || jsonb_build_object('version', md5(result::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_lifecycle_action(
  target_business_id uuid, target_user_id uuid, requested_action text,
  confirmation text DEFAULT '', expected_version text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE preview jsonb; owner_record jsonb; queued jsonb := '[]'::jsonb;
BEGIN
  IF NOT COALESCE(public.is_platform_admin(), false) THEN RAISE EXCEPTION 'Solo Superadmin.'; END IF;
  IF requested_action IS NULL OR requested_action NOT IN ('delete_business','remove_owner','deactivate','reactivate') THEN
    RAISE EXCEPTION 'Acción inválida.';
  END IF;
  IF requested_action <> 'delete_business' AND target_user_id IS NULL THEN RAISE EXCEPTION 'Falta el Owner.'; END IF;
  IF requested_action = 'delete_business' AND target_user_id IS NOT NULL THEN RAISE EXCEPTION 'No envíes un Owner para borrar el negocio.'; END IF;
  -- Serialize lifecycle changes with all writers (including existing invitation RPCs).
  -- Locks are held only for this transaction, never during the Auth API request.
  LOCK TABLE public.businesses, public.business_members, public.platform_admins,
    public.customers, public.rewards, public.visits, public.redemptions
    IN SHARE ROW EXCLUSIVE MODE;
  preview := public.admin_lifecycle_preview(target_business_id, target_user_id);
  IF target_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = target_user_id) THEN
    RAISE EXCEPTION 'La cuenta y los vínculos de un Superadmin están protegidos.';
  END IF;
  IF requested_action IN ('delete_business','remove_owner') THEN
    IF confirmation IS DISTINCT FROM preview->>'business_name' THEN RAISE EXCEPTION 'Escribe el nombre exacto del negocio.'; END IF;
    IF expected_version IS DISTINCT FROM preview->>'version' THEN RAISE EXCEPTION 'Los datos cambiaron. Revisa nuevamente el alcance.'; END IF;
    IF requested_action = 'delete_business' THEN
      -- Fail closed if legacy inconsistent cross-business references exist.
      IF EXISTS (SELECT 1 FROM public.redemptions d JOIN public.rewards r ON r.id = d.reward_id
        WHERE r.business_id = target_business_id AND d.business_id <> target_business_id)
      OR EXISTS (SELECT 1 FROM public.redemptions d JOIN public.customers c ON c.id = d.customer_id
        WHERE c.business_id = target_business_id AND d.business_id <> target_business_id)
      OR EXISTS (SELECT 1 FROM public.visits v JOIN public.customers c ON c.id = v.customer_id
        WHERE c.business_id = target_business_id AND v.business_id <> target_business_id) THEN
        RAISE EXCEPTION 'Hay referencias entre negocios; revisa los datos antes de eliminar.';
      END IF;
      DELETE FROM public.redemptions WHERE business_id = target_business_id;
      DELETE FROM public.visits WHERE business_id = target_business_id;
      DELETE FROM public.businesses WHERE id = target_business_id;
    ELSE
      DELETE FROM public.business_members WHERE business_id = target_business_id AND user_id = target_user_id AND role = 'owner';
    END IF;
    FOR owner_record IN SELECT value FROM jsonb_array_elements(preview->'owners') LOOP
      IF NOT (owner_record->>'protected')::boolean
        AND (owner_record->>'other_links')::bigint = 0
        AND (owner_record->>'customer_links')::bigint = 0 THEN
        INSERT INTO public.admin_account_retirements(user_id, requested_by)
        VALUES ((owner_record->>'user_id')::uuid, auth.uid()) ON CONFLICT DO NOTHING;
        queued := queued || jsonb_build_array(owner_record->>'user_id');
      END IF;
    END LOOP;
  ELSE
    -- Superadmin may leave a business with no active Owner and assign one later.
    UPDATE public.business_members SET active = (requested_action = 'reactivate')
    WHERE business_id = target_business_id AND user_id = target_user_id AND role = 'owner';
  END IF;
  RETURN jsonb_build_object('action', requested_action, 'queued_accounts', queued);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pending_retirements()
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT COALESCE(public.is_platform_admin(), false) THEN RAISE EXCEPTION 'Solo Superadmin.'; END IF;
  RETURN QUERY SELECT user_id FROM public.admin_account_retirements WHERE completed_at IS NULL ORDER BY created_at LIMIT 50;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_lifecycle_preview(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_lifecycle_action(uuid,uuid,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_pending_retirements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lifecycle_preview(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lifecycle_action(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pending_retirements() TO authenticated;
COMMIT;
