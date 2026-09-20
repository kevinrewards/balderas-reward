BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_business_active(
  target_business_id uuid,
  requested_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.is_platform_admin(), false) THEN
    RAISE EXCEPTION 'Solo Superadmin puede cambiar el estado de un negocio.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.businesses
     SET active = requested_active
   WHERE id = target_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El negocio ya no existe.';
  END IF;

  RETURN requested_active;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_business_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_business_active(uuid, boolean) TO authenticated;

COMMIT;
