BEGIN;
CREATE TABLE public.commerce_push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.commerce_requests(id) ON DELETE CASCADE,
 endpoint text NOT NULL CHECK(length(endpoint)<=2000),p256dh text NOT NULL,auth text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(request_id,endpoint)
);
CREATE TABLE public.commerce_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint NOT NULL REFERENCES public.commerce_events(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES public.commerce_push_subscriptions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','uncertain','skipped')),
 attempts integer NOT NULL DEFAULT 0,lease uuid,updated_at timestamptz NOT NULL DEFAULT now(),next_attempt_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,subscription_id)
);
CREATE INDEX commerce_push_pending ON public.commerce_push_deliveries(status,next_attempt_at);
CREATE INDEX commerce_push_by_subscription ON public.commerce_push_deliveries(subscription_id,status);
-- Only short-lived, one-use wake tickets travel through pg_net. No service keys.
CREATE TABLE public.commerce_push_wakes(nonce uuid PRIMARY KEY DEFAULT gen_random_uuid(),expires_at timestamptz NOT NULL DEFAULT now()+interval '2 minutes');
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_push_subscriptions','commerce_push_deliveries','commerce_push_wakes'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE FUNCTION public.commerce_push_subscription(token uuid,action text,subscription jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r commerce_requests%ROWTYPE; ep text:=subscription->>'endpoint'; found_id uuid;
BEGIN
 SELECT * INTO r FROM commerce_requests WHERE tracking_token=token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada.'; END IF;
 SELECT id INTO found_id FROM commerce_push_subscriptions WHERE request_id=r.id AND endpoint=ep;
 IF action='config' THEN RETURN jsonb_build_object('subscribed',found_id IS NOT NULL); END IF;
 IF action='unsubscribe' THEN DELETE FROM commerce_push_subscriptions WHERE id=found_id;RETURN jsonb_build_object('subscribed',false);END IF;
 IF action<>'subscribe' THEN RAISE EXCEPTION 'Acción inválida.';END IF;
 IF r.status IN ('completed','rejected','cancelled') OR NOT EXISTS(SELECT 1 FROM businesses b JOIN business_modules m ON m.business_id=b.id WHERE b.id=r.business_id AND b.active AND m.agenda) THEN RAISE EXCEPTION 'Esta solicitud ya no admite nuevos avisos.';END IF;
 IF coalesce(ep,'') !~ '^https://' OR length(ep)>2000 OR coalesce(subscription->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}$' OR coalesce(subscription->>'auth','') !~ '^[A-Za-z0-9_-]{20,30}$' THEN RAISE EXCEPTION 'Suscripción inválida.';END IF;
 IF found_id IS NULL AND (SELECT count(*) FROM commerce_push_subscriptions WHERE request_id=r.id)>=5 THEN RAISE EXCEPTION 'Esta solicitud ya tiene cinco dispositivos vinculados.';END IF;
 INSERT INTO commerce_push_subscriptions(request_id,endpoint,p256dh,auth) VALUES(r.id,ep,subscription->>'p256dh',subscription->>'auth')
 ON CONFLICT(request_id,endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth;
 RETURN jsonb_build_object('subscribed',true);
END $$;

CREATE FUNCTION public.commerce_push_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.actor<>'Negocio' THEN RETURN NEW; END IF;
 -- A newer update replaces older, unsent notifications for this request.
 UPDATE commerce_push_deliveries d SET status='skipped',updated_at=now() FROM commerce_push_subscriptions s
 WHERE d.subscription_id=s.id AND s.request_id=NEW.request_id AND d.status IN ('pending','failed');
 INSERT INTO commerce_push_deliveries(event_id,subscription_id)
 SELECT NEW.id,s.id FROM commerce_push_subscriptions s WHERE s.request_id=NEW.request_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_event_push AFTER INSERT ON public.commerce_events FOR EACH ROW EXECUTE FUNCTION public.commerce_push_enqueue();

CREATE FUNCTION public.commerce_push_consume_wake(ticket uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN DELETE FROM commerce_push_wakes WHERE nonce=ticket AND expires_at>now();RETURN FOUND;END $$;

CREATE FUNCTION public.commerce_push_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 UPDATE commerce_push_deliveries SET status='uncertain',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '3 minutes';
 UPDATE commerce_push_deliveries d SET status='skipped',updated_at=now() FROM commerce_push_subscriptions s,commerce_requests r,businesses b,business_modules m,commerce_events e
 WHERE d.subscription_id=s.id AND s.request_id=r.id AND b.id=r.business_id AND m.business_id=b.id AND e.id=d.event_id AND d.status IN ('pending','failed')
 AND (NOT b.active OR NOT m.agenda OR e.created_at<now()-interval '24 hours');
 WITH picked AS (
  SELECT d.id FROM commerce_push_deliveries d WHERE d.status IN ('pending','failed') AND d.attempts<3 AND d.next_attempt_at<=now() ORDER BY d.next_attempt_at,d.id FOR UPDATE SKIP LOCKED LIMIT 10
 ), claimed AS (
  UPDATE commerce_push_deliveries d SET status='sending',attempts=attempts+1,lease=gen_random_uuid(),updated_at=now() FROM picked p WHERE d.id=p.id RETURNING d.*
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'event_id',d.event_id,'subscription_id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth,
 'business_name',b.name,'token',r.tracking_token,'status',r.status,'confirmed_at',r.confirmed_at,'timezone',m.timezone)),'[]') INTO result
 FROM claimed d JOIN commerce_push_subscriptions s ON s.id=d.subscription_id JOIN commerce_requests r ON r.id=s.request_id JOIN businesses b ON b.id=r.business_id JOIN business_modules m ON m.business_id=b.id;
 RETURN result;
END $$;

CREATE FUNCTION public.commerce_push_finish(delivery uuid,lease_value uuid,result_status text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF result_status NOT IN ('accepted','failed','uncertain','skipped') THEN RAISE EXCEPTION 'Estado inválido.';END IF;
 UPDATE commerce_push_deliveries SET status=result_status,updated_at=now(),next_attempt_at=now()+interval '5 minutes' WHERE id=delivery AND lease=lease_value AND status='sending';RETURN FOUND;
END $$;

CREATE FUNCTION public.commerce_push_report(bid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.commerce_access(bid,'requests') THEN RAISE EXCEPTION 'No tienes acceso a estas solicitudes.' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'devices',(SELECT count(*) FROM commerce_push_subscriptions s WHERE s.request_id=r.id),
 'pending',(SELECT count(*) FROM commerce_push_deliveries d JOIN commerce_push_subscriptions s ON s.id=d.subscription_id WHERE s.request_id=r.id AND (d.status IN ('pending','sending') OR (d.status='failed' AND d.attempts<3))),
 'attention',(SELECT count(*) FROM commerce_push_deliveries d JOIN commerce_push_subscriptions s ON s.id=d.subscription_id WHERE s.request_id=r.id AND (d.status='uncertain' OR (d.status='failed' AND d.attempts>=3)))) )
 FROM (SELECT id FROM commerce_requests WHERE business_id=bid ORDER BY created_at DESC LIMIT 300) r),'[]');
END $$;

DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'commerce_push_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.commerce_push_report(uuid) TO authenticated;
COMMIT;
