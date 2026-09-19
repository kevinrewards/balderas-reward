-- Superadmin may link an existing account without creating another business.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_assign_existing_owner(target_business_id uuid, owner_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; normalized_email text := lower(btrim(owner_email));
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_platform_admin(),false) THEN
    RAISE EXCEPTION 'Solo Superadmin puede asignar Owners.';
  END IF;
  IF normalized_email IS NULL OR normalized_email = '' THEN RAISE EXCEPTION 'Escribe el correo del Owner.'; END IF;
  -- Serialize assignments for a business. Existing retirement guards still apply.
  PERFORM 1 FROM public.businesses WHERE id=target_business_id AND active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Elige un negocio activo existente.'; END IF;
  SELECT id INTO owner_id FROM auth.users WHERE lower(email)=normalized_email AND deleted_at IS NULL;
  IF owner_id IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
  UPDATE public.business_members SET role='owner',active=true
    WHERE business_id=target_business_id AND user_id=owner_id;
  IF NOT FOUND THEN
    INSERT INTO public.business_members(business_id,user_id,role,active)
    VALUES(target_business_id,owner_id,'owner',true);
  END IF;
  RETURN jsonb_build_object('found',true,'success',true,'user_id',owner_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_assign_existing_owner(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_existing_owner(uuid,text) TO authenticated;
COMMIT;
