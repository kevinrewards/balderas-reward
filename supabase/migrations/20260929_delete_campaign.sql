-- Delete one campaign and its delivery records; business permissions remain enforced.
CREATE OR REPLACE FUNCTION public.delete_business_campaign(target_business_id uuid, target_campaign_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.can_manage_business_settings(target_business_id),false) THEN
  RAISE EXCEPTION 'Solo Owner del negocio o Superadmin.';
 END IF;
 PERFORM 1 FROM public.business_campaigns WHERE id=target_campaign_id AND business_id=target_business_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'La promoción no existe o no pertenece al negocio.'; END IF;
 -- Keep the existing Wallet daily limit effective until its accounting window ends.
 IF EXISTS(SELECT 1 FROM public.campaign_wallet_dispatches WHERE campaign_id=target_campaign_id AND status IN ('sending','accepted','uncertain') AND created_at>now()-interval '24 hours') THEN
  RAISE EXCEPTION 'Puedes eliminarla 24 horas después del último envío a Wallet. Por ahora puedes archivarla.';
 END IF;
 DELETE FROM public.business_campaigns WHERE id=target_campaign_id AND business_id=target_business_id RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.delete_business_campaign(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_business_campaign(uuid,uuid) TO authenticated;
