BEGIN;
CREATE TABLE public.card_presentation (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
 program_name text NOT NULL CHECK(length(program_name) BETWEEN 1 AND 80),
 welcome_text text NOT NULL DEFAULT '' CHECK(length(welcome_text)<=240),
 primary_color text NOT NULL DEFAULT '#e1b85d' CHECK(primary_color ~ '^#[0-9a-fA-F]{6}$'),
 background_color text NOT NULL DEFAULT '#111112' CHECK(background_color ~ '^#[0-9a-fA-F]{6}$'),
 logo_url text NOT NULL DEFAULT '' CHECK(logo_url='' OR (logo_url ~ '^https://' AND length(logo_url)<=1500))
);
CREATE TABLE public.business_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
 kind text NOT NULL CHECK(kind IN ('promotion','news')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 notify_started_at timestamptz
);
CREATE INDEX ON public.business_campaigns(business_id,created_at DESC);
ALTER TABLE public.card_presentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_reads_design ON public.card_presentation FOR SELECT TO authenticated USING(public.can_manage_business_settings(business_id));
CREATE POLICY manager_reads_campaigns ON public.business_campaigns FOR SELECT TO authenticated USING(public.can_manage_business_settings(business_id));
REVOKE ALL ON public.card_presentation,public.business_campaigns FROM anon,authenticated;
GRANT SELECT ON public.card_presentation,public.business_campaigns TO authenticated;
GRANT ALL ON public.card_presentation,public.business_campaigns TO service_role;

CREATE FUNCTION public.save_card_presentation(target_business_id uuid, design jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.can_manage_business_settings(target_business_id),false) THEN RAISE EXCEPTION 'Solo Owner del negocio o Superadmin.'; END IF;
 INSERT INTO public.card_presentation(business_id,program_name,welcome_text,primary_color,background_color,logo_url)
 VALUES(target_business_id,btrim(design->>'program_name'),coalesce(design->>'welcome_text',''),design->>'primary_color',design->>'background_color',coalesce(design->>'logo_url',''))
 ON CONFLICT(business_id) DO UPDATE SET program_name=excluded.program_name,welcome_text=excluded.welcome_text,
 primary_color=excluded.primary_color,background_color=excluded.background_color,logo_url=excluded.logo_url;
END; $$;

CREATE FUNCTION public.manage_business_campaign(target_business_id uuid, action text, campaign_id uuid DEFAULT NULL, content jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.can_manage_business_settings(target_business_id),false) THEN RAISE EXCEPTION 'Solo Owner del negocio o Superadmin.'; END IF;
 IF action='create' THEN
  IF (content->>'expires_at')::timestamptz <= now() THEN RAISE EXCEPTION 'La fecha de vencimiento debe ser futura.'; END IF;
  INSERT INTO public.business_campaigns(business_id,title,body,kind,expires_at)
  VALUES(target_business_id,btrim(content->>'title'),btrim(content->>'body'),content->>'kind',(content->>'expires_at')::timestamptz) RETURNING id INTO result;
 ELSIF action='publish' THEN
  IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=target_business_id AND active) THEN RAISE EXCEPTION 'El negocio está desactivado.'; END IF;
  UPDATE public.business_campaigns SET status='published',published_at=now() WHERE id=campaign_id AND business_id=target_business_id AND status='draft' AND expires_at>now() RETURNING id INTO result;
 ELSIF action='archive' THEN
  UPDATE public.business_campaigns SET status='archived' WHERE id=campaign_id AND business_id=target_business_id RETURNING id INTO result;
 ELSE RAISE EXCEPTION 'Acción inválida.';
 END IF;
 IF result IS NULL THEN RAISE EXCEPTION 'La promoción cambió, venció o no pertenece al negocio.'; END IF;
 RETURN result;
END; $$;

CREATE FUNCTION public.get_card_experience(card_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid; result jsonb;
BEGIN
 SELECT c.business_id INTO bid FROM public.customers c JOIN public.businesses b ON b.id=c.business_id WHERE c.qr_token=card_token AND c.active AND b.active;
 IF bid IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('design',(SELECT to_jsonb(p)-'business_id' FROM public.card_presentation p WHERE p.business_id=bid),
 'campaigns',coalesce((SELECT jsonb_agg(t) FROM (SELECT id,title,body,kind,expires_at FROM public.business_campaigns WHERE business_id=bid AND status='published' AND expires_at>now() ORDER BY published_at DESC LIMIT 20)t),'[]'::jsonb)) INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.save_card_presentation(uuid,jsonb),public.manage_business_campaign(uuid,text,uuid,jsonb),public.get_card_experience(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_card_presentation(uuid,jsonb),public.manage_business_campaign(uuid,text,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_card_experience(uuid) TO anon,authenticated,service_role;

CREATE TABLE public.card_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 endpoint text NOT NULL CHECK(length(endpoint)<=2000),
 p256dh text NOT NULL, auth text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,endpoint)
);
CREATE TABLE public.campaign_push_deliveries (
 campaign_id uuid REFERENCES public.business_campaigns(id) ON DELETE CASCADE,
 subscription_id uuid REFERENCES public.card_push_subscriptions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed')),
 lease uuid, leased_at timestamptz, attempts integer NOT NULL DEFAULT 0,
 PRIMARY KEY(campaign_id,subscription_id)
);
ALTER TABLE public.card_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_push_subscriptions,public.campaign_push_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.card_push_subscriptions,public.campaign_push_deliveries TO service_role;

CREATE FUNCTION public.claim_campaign_push(target_campaign uuid, actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign public.business_campaigns%ROWTYPE; batch jsonb; lease_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO campaign FROM public.business_campaigns WHERE id=target_campaign FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Promoción no encontrada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=actor) AND NOT EXISTS(SELECT 1 FROM public.business_members WHERE user_id=actor AND business_id=campaign.business_id AND role='owner' AND active) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
 IF campaign.status<>'published' OR campaign.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=campaign.business_id AND active) THEN RAISE EXCEPTION 'Promoción vencida, archivada o negocio desactivado.'; END IF;
 IF campaign.notify_started_at IS NULL THEN
  INSERT INTO public.campaign_push_deliveries(campaign_id,subscription_id)
   SELECT target_campaign,s.id FROM public.card_push_subscriptions s JOIN public.customers c ON c.id=s.customer_id
   WHERE s.business_id=campaign.business_id AND c.business_id=campaign.business_id AND c.active ON CONFLICT DO NOTHING;
  UPDATE public.business_campaigns SET notify_started_at=now() WHERE id=target_campaign;
 END IF;
 UPDATE public.campaign_push_deliveries d SET status='sending',lease=lease_id,leased_at=now(),attempts=attempts+1
 WHERE (d.campaign_id,d.subscription_id) IN (SELECT x.campaign_id,x.subscription_id FROM public.campaign_push_deliveries x
 WHERE x.campaign_id=target_campaign AND x.attempts<3 AND (x.status IN ('pending','failed') OR (x.status='sending' AND x.leased_at<now()-interval '5 minutes')) ORDER BY x.subscription_id LIMIT 10 FOR UPDATE SKIP LOCKED);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,'token',c.qr_token)),'[]'::jsonb) INTO batch
 FROM public.campaign_push_deliveries d JOIN public.card_push_subscriptions s ON s.id=d.subscription_id JOIN public.customers c ON c.id=s.customer_id
 WHERE d.campaign_id=target_campaign AND d.lease=lease_id AND c.active;
 RETURN jsonb_build_object('lease',lease_id,'campaign',to_jsonb(campaign),'subscriptions',batch);
END; $$;
REVOKE ALL ON FUNCTION public.claim_campaign_push(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_push(uuid,uuid) TO service_role;

-- A suspended business cannot keep accepting visits/redemptions through old clients.
CREATE FUNCTION public.guard_active_business_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=NEW.business_id AND active) THEN RAISE EXCEPTION 'Este negocio está desactivado.'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_active_business_operation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER visits_require_active_business BEFORE INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION public.guard_active_business_operation();
CREATE TRIGGER redemptions_require_active_business BEFORE INSERT ON public.redemptions FOR EACH ROW EXECUTE FUNCTION public.guard_active_business_operation();
CREATE TABLE public.campaign_wallet_dispatches (
 campaign_id uuid PRIMARY KEY REFERENCES public.business_campaigns(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('sending','accepted','failed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_wallet_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_wallet_dispatches FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.campaign_wallet_dispatches TO service_role;
CREATE FUNCTION public.claim_wallet_campaign(target_campaign uuid, actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.business_campaigns%ROWTYPE; result uuid; previous text;
BEGIN
 SELECT * INTO c FROM public.business_campaigns WHERE id=target_campaign;
 IF NOT FOUND THEN RAISE EXCEPTION 'Promoción no encontrada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=actor) AND NOT EXISTS(SELECT 1 FROM public.business_members WHERE user_id=actor AND business_id=c.business_id AND role='owner' AND active) THEN RAISE EXCEPTION 'No autorizado.'; END IF;
 PERFORM 1 FROM public.businesses WHERE id=c.business_id AND active FOR UPDATE;
 IF NOT FOUND OR c.status<>'published' OR c.expires_at<=now() THEN RAISE EXCEPTION 'Negocio o promoción no disponibles.'; END IF;
 SELECT status INTO previous FROM public.campaign_wallet_dispatches WHERE campaign_id=target_campaign;
 IF previous IN ('sending','accepted','uncertain') THEN RETURN jsonb_build_object('claimed',false,'status',previous); END IF;
 IF (SELECT count(*) FROM public.campaign_wallet_dispatches WHERE business_id=c.business_id AND created_at>now()-interval '24 hours' AND status IN ('sending','accepted','uncertain'))>=3 THEN RAISE EXCEPTION 'Límite de tres avisos de Wallet por negocio en 24 horas.'; END IF;
 INSERT INTO public.campaign_wallet_dispatches(campaign_id,business_id,status) VALUES(c.id,c.business_id,'sending')
 ON CONFLICT(campaign_id) DO UPDATE SET status='sending',created_at=now() WHERE campaign_wallet_dispatches.status='failed' RETURNING campaign_id INTO result;
 RETURN jsonb_build_object('claimed',result IS NOT NULL,'campaign',to_jsonb(c));
END; $$;
REVOKE ALL ON FUNCTION public.claim_wallet_campaign(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wallet_campaign(uuid,uuid) TO service_role;
COMMIT;
