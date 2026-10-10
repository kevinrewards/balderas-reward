BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('catalog-assets','catalog-assets',true,4194304,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.commerce_image_access(path text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid;
BEGIN
 BEGIN bid:=split_part(path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.commerce_access(bid,'catalog') AND EXISTS(SELECT 1 FROM public.business_modules WHERE business_id=bid AND (catalog OR agenda));
END $$;
REVOKE ALL ON FUNCTION public.commerce_image_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_image_access(text) TO authenticated;
CREATE POLICY catalog_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='catalog-assets' AND public.commerce_image_access(name));
CREATE POLICY catalog_image_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='catalog-assets' AND public.commerce_image_access(name));
CREATE POLICY catalog_image_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='catalog-assets' AND public.commerce_image_access(name));
COMMIT;
