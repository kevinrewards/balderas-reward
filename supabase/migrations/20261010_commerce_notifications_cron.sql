BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.commerce_push_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ticket uuid;
BEGIN
 DELETE FROM commerce_push_wakes WHERE expires_at<now();
 UPDATE commerce_push_deliveries SET status='uncertain',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '3 minutes';
 IF NOT EXISTS(SELECT 1 FROM commerce_push_deliveries WHERE status IN ('pending','failed') AND attempts<3 AND next_attempt_at<=now()) THEN RETURN; END IF;
 INSERT INTO commerce_push_wakes DEFAULT VALUES RETURNING nonce INTO ticket;
 PERFORM net.http_post(url:='https://aitupbowuekcfdqsksny.supabase.co/functions/v1/commerce',
 headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('action','dispatch','ticket',ticket),timeout_milliseconds:=50000);
END $$;
REVOKE ALL ON FUNCTION public.commerce_push_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_push_tick() TO service_role;
SELECT cron.schedule('balderas-commerce-push','* * * * *','SELECT public.commerce_push_tick();');
SELECT cron.schedule('balderas-commerce-push-cleanup','17 4 * * *',$job$
 DELETE FROM public.commerce_push_deliveries WHERE updated_at<now()-interval '30 days' AND status NOT IN ('pending','sending');
 DELETE FROM public.commerce_push_subscriptions s USING public.commerce_requests r WHERE s.request_id=r.id AND r.status IN ('completed','cancelled','rejected') AND r.updated_at<now()-interval '30 days';
 DELETE FROM cron.job_run_details WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname IN ('balderas-commerce-push','balderas-commerce-push-cleanup')) AND end_time<now()-interval '7 days';
$job$);
COMMIT;
