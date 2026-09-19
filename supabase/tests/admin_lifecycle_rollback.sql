-- Supabase SQL Editor, after installing 20260921_admin_lifecycle.sql.
-- No Edge Function calls: all fixture data and queue changes are rolled back.
BEGIN;
DO $$
DECLARE
  admin_id uuid := '8fc7896c-2102-4cae-ad63-4fa9cecdae08';
  owner_id uuid := '7adff3ee-7dad-4ac8-b416-4f714d1e7076';
  staff_id uuid := '1c0a5592-0146-4f8f-b515-c1a66bc1e4e4';
  orphan_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  preview jsonb;
  result jsonb;
  denied boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = admin_id) THEN
    RAISE EXCEPTION 'La cuenta de prueba Superadmin ya no está disponible.';
  END IF;
  INSERT INTO public.businesses(id,name,slug,active) VALUES
    (first_id,'PRUEBA BAJA A','prueba-baja-' || first_id,true),
    (second_id,'PRUEBA BAJA B','prueba-baja-' || second_id,true);
  INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
    VALUES (orphan_id,orphan_id || '@example.invalid','{"full_name":"Prueba temporal"}','{}');
  INSERT INTO public.business_members(business_id,user_id,role,active) VALUES
    (first_id,owner_id,'owner',true), (second_id,owner_id,'staff',false),
    (first_id,orphan_id,'owner',true), (first_id,admin_id,'owner',true);

  -- These SECURITY DEFINER functions must enforce identity even in SQL Editor.
  FOREACH orphan_id IN ARRAY ARRAY[owner_id,staff_id] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',orphan_id,'role','authenticated')::text,true);
    denied := false;
    BEGIN
      PERFORM public.admin_lifecycle_action(first_id,owner_id,'deactivate');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%Solo Superadmin%' THEN RAISE; END IF;
      denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Owner/Staff pudo administrar Owners.'; END IF;
  END LOOP;
  SELECT user_id INTO orphan_id FROM public.business_members
    WHERE business_id = first_id AND user_id NOT IN (owner_id,admin_id);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  PERFORM public.admin_lifecycle_action(first_id,owner_id,'deactivate');
  IF EXISTS (SELECT 1 FROM public.business_members WHERE business_id=first_id AND user_id=owner_id AND active) THEN
    RAISE EXCEPTION 'No desactivó el vínculo.';
  END IF;
  PERFORM public.admin_lifecycle_action(first_id,owner_id,'reactivate');
  IF NOT EXISTS (SELECT 1 FROM public.business_members WHERE business_id=first_id AND user_id=owner_id AND active) THEN
    RAISE EXCEPTION 'No reactivó el vínculo.';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.admin_lifecycle_action(first_id,admin_id,'deactivate');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%protegidos%' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Se alteró el vínculo de Superadmin.'; END IF;

  preview := public.admin_lifecycle_preview(first_id,owner_id);
  result := public.admin_lifecycle_action(first_id,owner_id,'remove_owner','PRUEBA BAJA A',preview->>'version');
  IF jsonb_array_length(result->'queued_accounts') <> 0 THEN RAISE EXCEPTION 'Se retiró una cuenta multinegocio.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_members WHERE business_id=second_id AND user_id=owner_id AND NOT active) THEN
    RAISE EXCEPTION 'Se alteró el vínculo inactivo con el segundo negocio.';
  END IF;

  denied := false;
  BEGIN
    PERFORM public.admin_lifecycle_action(first_id,NULL,'delete_business','PRUEBA BAJA A','version-obsoleta');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%datos cambiaron%' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Aceptó una previsualización obsoleta.'; END IF;
  preview := public.admin_lifecycle_preview(first_id);
  result := public.admin_lifecycle_action(first_id,NULL,'delete_business','PRUEBA BAJA A',preview->>'version');
  IF EXISTS (SELECT 1 FROM public.businesses WHERE id=first_id)
    OR EXISTS (SELECT 1 FROM public.business_members WHERE business_id=first_id) THEN
    RAISE EXCEPTION 'El borrado no terminó.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=second_id) THEN RAISE EXCEPTION 'Borró otro negocio.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_account_retirements WHERE user_id=orphan_id) THEN RAISE EXCEPTION 'No encoló la cuenta sin vínculos.'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_account_retirements WHERE user_id=admin_id) THEN RAISE EXCEPTION 'Encoló un Superadmin.'; END IF;
  denied := false;
  BEGIN
    INSERT INTO public.business_members(business_id,user_id,role,active) VALUES (second_id,orphan_id,'owner',true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%cuenta fue retirada%' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Permitió reasignar una cuenta en proceso de baja.'; END IF;
END;
$$;
SELECT 'CORRECTO: permisos, protección de Superadmin, multinegocio, versión y cola de bajas' AS resultado;
ROLLBACK;
