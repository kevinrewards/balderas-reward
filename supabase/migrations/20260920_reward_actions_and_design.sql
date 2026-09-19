-- Pending manual application. Creates two RPCs; does not delete rewards now.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_business_reward(
  target_business_id uuid,
  target_reward_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  found_id uuid;
BEGIN
  IF auth.uid() IS NULL OR
     NOT COALESCE(public.can_manage_business_settings(target_business_id), false) THEN
    RAISE EXCEPTION 'Solo Superadmin u Owner activo del negocio puede eliminar recompensas'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.id INTO found_id
  FROM public.rewards r
  WHERE r.id = target_reward_id AND r.business_id = target_business_id
  FOR UPDATE;

  IF found_id IS NULL THEN
    RAISE EXCEPTION 'Recompensa no encontrada en este negocio';
  END IF;
  IF EXISTS (SELECT 1 FROM public.redemptions WHERE reward_id = found_id) THEN
    RAISE EXCEPTION 'Esta recompensa tiene canjes registrados. Puedes desactivarla para conservar el historial.';
  END IF;

  DELETE FROM public.rewards WHERE id = found_id AND business_id = target_business_id;
  RETURN found_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_business_reward(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_business_reward(uuid, uuid) TO authenticated;

-- The public card already uses its secret token to read visits/rewards.
-- This RPC returns ONLY two display symbols for that same valid active card.
CREATE OR REPLACE FUNCTION public.get_loyalty_card_design(card_token uuid)
RETURNS TABLE (progress_emoji text, empty_emoji text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(NULLIF(bb.progress_emoji, ''), '★')::text,
         COALESCE(NULLIF(bb.empty_emoji, ''), '☆')::text
  FROM public.customers c
  JOIN public.businesses b ON b.id = c.business_id
  LEFT JOIN public.business_branding bb ON bb.business_id = b.id
  WHERE c.qr_token = card_token AND c.active = true AND b.active = true
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_loyalty_card_design(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_card_design(uuid) TO anon, authenticated;

COMMIT;
