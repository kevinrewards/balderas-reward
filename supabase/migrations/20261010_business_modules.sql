BEGIN;
CREATE TABLE public.business_modules (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
 loyalty boolean NOT NULL DEFAULT true, catalog boolean NOT NULL DEFAULT false, agenda boolean NOT NULL DEFAULT false,
 loyalty_label text NOT NULL DEFAULT 'Lealtad' CHECK(length(loyalty_label) BETWEEN 1 AND 40),
 catalog_label text NOT NULL DEFAULT 'Menú / Productos' CHECK(length(catalog_label) BETWEEN 1 AND 40),
 agenda_label text NOT NULL DEFAULT 'Pedidos / Agenda' CHECK(length(agenda_label) BETWEEN 1 AND 40),
 modes text[] NOT NULL DEFAULT ARRAY['service'] CHECK(modes <@ ARRAY['delivery','dine_in','pickup','service','reservation']::text[] AND cardinality(modes)>0),
 timezone text NOT NULL DEFAULT 'America/Mazatlan', reservation_capacity integer NOT NULL DEFAULT 20 CHECK(reservation_capacity BETWEEN 1 AND 1000),
 service_capacity integer NOT NULL DEFAULT 1 CHECK(service_capacity BETWEEN 1 AND 100),
 default_minutes integer NOT NULL DEFAULT 60 CHECK(default_minutes BETWEEN 5 AND 1440),
 opens time NOT NULL DEFAULT '09:00', closes time NOT NULL DEFAULT '20:00', CHECK(opens<closes)
);
INSERT INTO public.business_modules(business_id) SELECT id FROM public.businesses;
CREATE TABLE public.commerce_staff_permissions (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 edit_catalog boolean NOT NULL DEFAULT false, manage_requests boolean NOT NULL DEFAULT true,
 PRIMARY KEY(business_id,user_id)
);
CREATE TABLE public.catalog_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 category text NOT NULL DEFAULT 'General' CHECK(length(category) BETWEEN 1 AND 80),
 price numeric(12,2) CHECK(price>=0), image_url text NOT NULL DEFAULT '' CHECK(image_url='' OR (image_url LIKE 'https://%' AND length(image_url)<2000)),
 kind text NOT NULL DEFAULT 'product' CHECK(kind IN ('product','service')), duration_minutes integer NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 5 AND 1440),
 available boolean NOT NULL DEFAULT true, visible boolean NOT NULL DEFAULT true, featured boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.catalog_items(business_id,sort_order);
CREATE TABLE public.commerce_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 tracking_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), request_key uuid NOT NULL, client_hash text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100), contact text NOT NULL CHECK(length(btrim(contact)) BETWEEN 7 AND 254),
 mode text NOT NULL CHECK(mode IN ('delivery','dine_in','pickup','service','reservation')),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=1000), comments text NOT NULL DEFAULT '' CHECK(length(comments)<=2000),
 items jsonb NOT NULL DEFAULT '[]', party_size integer NOT NULL DEFAULT 1 CHECK(party_size BETWEEN 1 AND 1000),
 requested_date date, requested_at timestamptz, confirmed_at timestamptz, duration_minutes integer NOT NULL DEFAULT 60 CHECK(duration_minutes BETWEEN 5 AND 1440),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','in_progress','completed','rejected','cancelled')),
 customer_response text NOT NULL DEFAULT 'none' CHECK(customer_response IN ('none','pending','accepted','change_requested')),
 business_note text NOT NULL DEFAULT '' CHECK(length(business_note)<=2000), revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,request_key)
);
CREATE INDEX ON public.commerce_requests(business_id,created_at DESC);
CREATE TABLE public.commerce_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id uuid NOT NULL REFERENCES public.commerce_requests(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, snapshot jsonb NOT NULL
);
CREATE INDEX ON public.commerce_events(request_id,id);

CREATE FUNCTION public.commerce_access(bid uuid, operation text DEFAULT 'read') RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (coalesce(public.is_platform_admin(),false) OR EXISTS (
 SELECT 1 FROM business_members m LEFT JOIN commerce_staff_permissions p ON p.business_id=m.business_id AND p.user_id=m.user_id
 JOIN businesses b ON b.id=m.business_id AND b.active WHERE m.business_id=bid AND m.user_id=auth.uid() AND m.active
 AND (m.role='owner' OR (m.role='staff' AND (operation IN ('read','availability') OR (operation='catalog' AND coalesce(p.edit_catalog,false)) OR (operation='requests' AND coalesce(p.manage_requests,true)))))))
$$;
CREATE FUNCTION public.commerce_manager(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (coalesce(public.is_platform_admin(),false) OR EXISTS(SELECT 1 FROM business_members m JOIN businesses b ON b.id=m.business_id AND b.active WHERE m.business_id=bid AND m.user_id=auth.uid() AND m.active AND m.role='owner'))
$$;
CREATE FUNCTION public.loyalty_enabled(bid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM businesses b LEFT JOIN business_modules m ON m.business_id=b.id WHERE b.id=bid AND b.active AND coalesce(m.loyalty,true))
$$;
CREATE FUNCTION public.commerce_init() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
 BEGIN INSERT INTO business_modules(business_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER commerce_business_created AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.commerce_init();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['business_modules','commerce_staff_permissions','catalog_items','commerce_requests','commerce_events'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.commerce_events_id_seq TO service_role;
GRANT SELECT ON public.business_modules TO authenticated;
CREATE POLICY modules_read ON public.business_modules FOR SELECT TO authenticated USING(public.commerce_access(business_id));

CREATE FUNCTION public.commerce_log(r public.commerce_requests, actor_name text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO commerce_events(request_id,actor,snapshot) VALUES(r.id,actor_name,
 to_jsonb(r)-'tracking_token'-'client_hash'-'request_key'-'contact'-'address'-'business_id')
$$;
CREATE FUNCTION public.commerce_item_snapshot(bid uuid, selections jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; item catalog_items%ROWTYPE; result jsonb:='[]'; qty integer; seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF jsonb_typeof(selections)<>'array' OR jsonb_array_length(selections)>30 THEN RAISE EXCEPTION 'Selecciona como máximo 30 productos o servicios.'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(selections) LOOP
 SELECT * INTO item FROM catalog_items WHERE business_id=bid AND id=(v->>'id')::uuid AND visible AND available;
 IF NOT FOUND OR item.id=ANY(seen) THEN RAISE EXCEPTION 'Uno de los productos ya no está disponible o está repetido.'; END IF;
 qty:=(v->>'quantity')::integer; IF qty IS NULL OR qty<1 OR qty>99 THEN RAISE EXCEPTION 'Cantidad inválida.'; END IF;
 seen:=array_append(seen,item.id);
 result:=result||jsonb_build_array(jsonb_build_object('id',item.id,'name',item.name,'quantity',qty,'price',item.price,'kind',item.kind,'duration_minutes',item.duration_minutes));
 END LOOP; RETURN result;
END $$;

CREATE FUNCTION public.commerce_time(value text, zone text) RETURNS timestamptz LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN nullif(value,'') IS NULL THEN NULL WHEN value ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN value::timestamptz ELSE value::timestamp AT TIME ZONE zone END
$$;
CREATE FUNCTION public.commerce_manage(bid uuid, action text, payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m business_modules%ROWTYPE; r commerce_requests%ROWTYPE; old_r commerce_requests%ROWTYPE; it catalog_items%ROWTYPE;
 result jsonb; target uuid; duration integer; used integer; capacity integer; local_start timestamp;
BEGIN
 IF NOT public.commerce_access(bid) THEN RAISE EXCEPTION 'No tienes acceso a este negocio.' USING ERRCODE='42501'; END IF;
 -- All changes and confirmations for the same business serialize on this row.
 PERFORM 1 FROM businesses WHERE id=bid FOR UPDATE;
 SELECT * INTO m FROM business_modules WHERE business_id=bid;
 IF action='get' THEN
 RETURN jsonb_build_object('modules',to_jsonb(m),'manager',public.commerce_manager(bid),'edit_catalog',public.commerce_access(bid,'catalog'),'manage_requests',public.commerce_access(bid,'requests'),
 'code',(SELECT public_code FROM business_registration_links WHERE business_id=bid),
 'items',CASE WHEN m.catalog OR m.agenda THEN coalesce((SELECT jsonb_agg(i ORDER BY sort_order,name) FROM catalog_items i WHERE business_id=bid),'[]') ELSE '[]'::jsonb END,
 'requests',CASE WHEN m.agenda AND public.commerce_access(bid,'requests') THEN coalesce((SELECT jsonb_agg(q ORDER BY created_at DESC) FROM (SELECT id,name,contact,mode,address,comments,items,party_size,requested_date,requested_at,confirmed_at,duration_minutes,status,customer_response,business_note,revision,created_at,updated_at FROM commerce_requests WHERE business_id=bid ORDER BY created_at DESC LIMIT 300)q),'[]') ELSE '[]'::jsonb END,
 'staff',CASE WHEN public.commerce_manager(bid) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',b.user_id,'edit_catalog',coalesce(p.edit_catalog,false),'manage_requests',coalesce(p.manage_requests,true))) FROM business_members b LEFT JOIN commerce_staff_permissions p ON p.business_id=b.business_id AND p.user_id=b.user_id WHERE b.business_id=bid AND b.role='staff' AND b.active),'[]') ELSE '[]'::jsonb END);
 ELSIF action='modules' THEN
 IF NOT coalesce(public.is_platform_admin(),false) THEN RAISE EXCEPTION 'Solo Superadmin puede habilitar módulos.'; END IF;
 UPDATE business_modules SET loyalty=(payload->>'loyalty')::boolean,catalog=(payload->>'catalog')::boolean,agenda=(payload->>'agenda')::boolean,
 loyalty_label=btrim(payload->>'loyalty_label'),catalog_label=btrim(payload->>'catalog_label'),agenda_label=btrim(payload->>'agenda_label'),
 modes=ARRAY(SELECT jsonb_array_elements_text(payload->'modes')) WHERE business_id=bid;
 ELSIF action='settings' THEN
 IF NOT public.commerce_manager(bid) THEN RAISE EXCEPTION 'Solo Owner o Superadmin puede configurar la agenda.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=payload->>'timezone') THEN RAISE EXCEPTION 'Zona horaria inválida.'; END IF;
 UPDATE business_modules SET timezone=payload->>'timezone',reservation_capacity=(payload->>'reservation_capacity')::integer,
 service_capacity=(payload->>'service_capacity')::integer,default_minutes=(payload->>'default_minutes')::integer,opens=(payload->>'opens')::time,closes=(payload->>'closes')::time WHERE business_id=bid;
 ELSIF action='permissions' THEN
 IF NOT public.commerce_manager(bid) THEN RAISE EXCEPTION 'Solo Owner o Superadmin puede configurar permisos.'; END IF;
 target:=(payload->>'user_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM business_members WHERE business_id=bid AND user_id=target AND active AND role='staff') THEN RAISE EXCEPTION 'Trabajador no disponible.'; END IF;
 INSERT INTO commerce_staff_permissions VALUES(bid,target,(payload->>'edit_catalog')::boolean,(payload->>'manage_requests')::boolean)
 ON CONFLICT(business_id,user_id) DO UPDATE SET edit_catalog=excluded.edit_catalog,manage_requests=excluded.manage_requests;
 ELSIF action IN ('save_item','delete_item','availability') THEN
 IF NOT(m.catalog OR m.agenda) THEN RAISE EXCEPTION 'Catálogo y agenda desactivados.'; END IF;
 IF NOT public.commerce_access(bid,CASE WHEN action='availability' THEN 'availability' ELSE 'catalog' END) THEN RAISE EXCEPTION 'No tienes permiso para editar el catálogo.'; END IF;
 target:=nullif(payload->>'id','')::uuid;
 IF action='delete_item' THEN
 IF NOT public.commerce_manager(bid) THEN RAISE EXCEPTION 'Solo Owner o Superadmin puede eliminar productos.'; END IF;
 DELETE FROM catalog_items WHERE id=target AND business_id=bid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado en este negocio.'; END IF;
 ELSIF action='availability' THEN UPDATE catalog_items SET available=(payload->>'available')::boolean WHERE id=target AND business_id=bid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado en este negocio.'; END IF;
 ELSE
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM catalog_items WHERE id=target AND business_id=bid) THEN RAISE EXCEPTION 'Producto de otro negocio o eliminado.'; END IF;
 INSERT INTO catalog_items(id,business_id,name,description,category,price,image_url,kind,duration_minutes,available,visible,featured,sort_order)
 VALUES(coalesce(target,gen_random_uuid()),bid,btrim(payload->>'name'),coalesce(payload->>'description',''),coalesce(nullif(btrim(payload->>'category'),''),'General'),nullif(payload->>'price','')::numeric,coalesce(payload->>'image_url',''),payload->>'kind',(payload->>'duration_minutes')::integer,(payload->>'available')::boolean,(payload->>'visible')::boolean,(payload->>'featured')::boolean,(payload->>'sort_order')::integer)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,price=excluded.price,image_url=excluded.image_url,kind=excluded.kind,duration_minutes=excluded.duration_minutes,available=excluded.available,visible=excluded.visible,featured=excluded.featured,sort_order=excluded.sort_order RETURNING id INTO target;
 END IF;
 ELSIF action='update_request' THEN
 IF NOT m.agenda OR NOT public.commerce_access(bid,'requests') THEN RAISE EXCEPTION 'No tienes acceso a la agenda.'; END IF;
 SELECT * INTO r FROM commerce_requests WHERE business_id=bid AND id=(payload->>'id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada.'; END IF;
 IF (payload->>'revision') IS NULL OR r.revision<>(payload->>'revision')::integer THEN RAISE EXCEPTION 'Otra persona modificó la solicitud. Actualiza antes de guardar.'; END IF;
 IF r.status IN ('completed','rejected','cancelled') THEN RAISE EXCEPTION 'Esta solicitud ya está cerrada.'; END IF;
 old_r:=r;
 r.status:=payload->>'status';
 IF r.status NOT IN ('pending','confirmed','in_progress','completed','rejected','cancelled') OR r.status IS NULL THEN RAISE EXCEPTION 'Estado inválido.'; END IF;
 r.confirmed_at:=public.commerce_time(payload->>'confirmed_at',m.timezone);
 r.business_note:=coalesce(payload->>'business_note','');r.address:=coalesce(payload->>'address',r.address);
 r.party_size:=coalesce((payload->>'party_size')::integer,r.party_size);
 IF payload ? 'items' THEN r.items:=public.commerce_item_snapshot(bid,payload->'items'); END IF;
 IF r.mode<>'reservation' AND jsonb_array_length(r.items)=0 THEN RAISE EXCEPTION 'Selecciona al menos un producto o servicio.'; END IF;
 IF r.mode='delivery' AND length(btrim(r.address))<5 THEN RAISE EXCEPTION 'Escribe la dirección de entrega.'; END IF;
 r.duration_minutes:=coalesce((payload->>'duration_minutes')::integer,r.duration_minutes);
 IF r.status IN ('confirmed','in_progress') AND r.confirmed_at IS NOT NULL AND r.mode IN ('service','reservation','dine_in') THEN
 IF r.confirmed_at<now() AND r.confirmed_at IS DISTINCT FROM old_r.confirmed_at THEN RAISE EXCEPTION 'El horario debe ser futuro.'; END IF;
 local_start:=r.confirmed_at AT TIME ZONE m.timezone;
 IF local_start::time<m.opens OR (local_start+make_interval(mins=>r.duration_minutes))::date<>local_start::date OR (local_start+make_interval(mins=>r.duration_minutes))::time>m.closes THEN RAISE EXCEPTION 'El horario queda fuera de la apertura del negocio.'; END IF;
 capacity:=CASE WHEN r.mode='service' THEN m.service_capacity ELSE m.reservation_capacity END;
 SELECT coalesce(sum(CASE WHEN q.mode='service' THEN 1 ELSE q.party_size END),0) INTO used FROM commerce_requests q
 WHERE q.business_id=bid AND q.id<>r.id AND q.status IN ('confirmed','in_progress') AND q.confirmed_at IS NOT NULL
 AND (CASE WHEN r.mode='service' THEN q.mode='service' ELSE q.mode IN ('reservation','dine_in') END)
 AND q.confirmed_at<r.confirmed_at+make_interval(mins=>r.duration_minutes) AND q.confirmed_at+make_interval(mins=>q.duration_minutes)>r.confirmed_at;
 IF used+(CASE WHEN r.mode='service' THEN 1 ELSE r.party_size END)>capacity THEN RAISE EXCEPTION 'No hay capacidad disponible en ese horario.'; END IF;
 END IF;
 IF r.status='pending' THEN r.confirmed_at:=NULL; END IF;
 IF r.status IN ('confirmed','in_progress') AND (r.confirmed_at IS DISTINCT FROM coalesce(old_r.confirmed_at,r.requested_at) OR r.items IS DISTINCT FROM old_r.items OR old_r.customer_response='change_requested') THEN r.customer_response:='pending'; END IF;
 UPDATE commerce_requests SET status=r.status,confirmed_at=r.confirmed_at,business_note=r.business_note,address=r.address,items=r.items,party_size=r.party_size,duration_minutes=r.duration_minutes,customer_response=r.customer_response,revision=revision+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 PERFORM public.commerce_log(r,'Negocio'); target:=r.id;
 ELSE RAISE EXCEPTION 'Acción no disponible.'; END IF;
 RETURN jsonb_build_object('ok',true,'id',target);
END $$;

CREATE FUNCTION public.commerce_public_info(code uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid; m business_modules%ROWTYPE; branding jsonb;
BEGIN
 SELECT b.id INTO bid FROM businesses b JOIN business_registration_links l ON l.business_id=b.id WHERE l.public_code=code AND b.active;
 IF bid IS NULL THEN RAISE EXCEPTION 'Este negocio no está disponible.'; END IF;
 SELECT * INTO m FROM business_modules WHERE business_id=bid;
 SELECT to_jsonb(p) INTO branding FROM business_branding p WHERE business_id=bid;
 RETURN jsonb_build_object('name',(SELECT name FROM businesses WHERE id=bid),'modules',to_jsonb(m)-'business_id',
 'logo_path',branding->>'logo_path','logo_url',(SELECT logo_url FROM card_presentation WHERE business_id=bid),
 'items',CASE WHEN m.catalog OR m.agenda THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'category',category,'price',price,'image_url',image_url,'kind',kind,'duration_minutes',duration_minutes,'available',available,'featured',featured) ORDER BY featured DESC,sort_order,name) FROM catalog_items WHERE business_id=bid AND visible),'[]') ELSE '[]'::jsonb END);
END $$;

CREATE FUNCTION public.commerce_submit(code uuid, request_key_value uuid, hash_value text, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid; m business_modules%ROWTYPE; r commerce_requests%ROWTYPE; selected jsonb; duration integer;
BEGIN
 IF hash_value IS NULL OR hash_value !~ '^[a-f0-9]{64}$' OR request_key_value IS NULL THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 SELECT b.id INTO bid FROM businesses b JOIN business_registration_links l ON l.business_id=b.id WHERE l.public_code=code AND b.active FOR UPDATE OF b;
 SELECT * INTO m FROM business_modules WHERE business_id=bid;
 IF bid IS NULL OR NOT m.agenda THEN RAISE EXCEPTION 'El negocio no recibe solicitudes en este momento.'; END IF;
 SELECT * INTO r FROM commerce_requests WHERE business_id=bid AND request_key=request_key_value;
 IF FOUND THEN
 IF r.client_hash<>hash_value THEN RAISE EXCEPTION 'Solicitud inválida.'; END IF;
 RETURN jsonb_build_object('token',r.tracking_token,'id',r.id);
 END IF;
 IF (SELECT count(*) FROM commerce_requests WHERE business_id=bid AND created_at>now()-interval '1 hour')>=300 OR (SELECT count(*) FROM commerce_requests WHERE business_id=bid AND client_hash=hash_value AND created_at>now()-interval '10 minutes')>=10 THEN RAISE EXCEPTION 'Demasiadas solicitudes. Intenta más tarde.'; END IF;
 IF NOT ((payload->>'mode')=ANY(m.modes)) OR payload->>'mode' IS NULL THEN RAISE EXCEPTION 'Modalidad no disponible.'; END IF;
 IF payload->>'mode'='delivery' AND length(btrim(coalesce(payload->>'address','')))<5 THEN RAISE EXCEPTION 'Escribe la dirección de entrega.'; END IF;
 selected:=public.commerce_item_snapshot(bid,coalesce(payload->'items','[]'));
 IF payload->>'mode'<>'reservation' AND jsonb_array_length(selected)=0 THEN RAISE EXCEPTION 'Selecciona al menos un producto o servicio.'; END IF;
 SELECT coalesce(sum((v->>'duration_minutes')::integer*(v->>'quantity')::integer),m.default_minutes) INTO duration FROM jsonb_array_elements(selected) v WHERE v->>'kind'='service';
 IF nullif(payload->>'requested_date','')::date<(now() AT TIME ZONE m.timezone)::date THEN RAISE EXCEPTION 'La fecha debe ser futura o de hoy.'; END IF;
 IF public.commerce_time(payload->>'requested_at',m.timezone)<now() THEN RAISE EXCEPTION 'Elige un horario futuro o déjalo por acordar.'; END IF;
 INSERT INTO commerce_requests(business_id,request_key,client_hash,name,contact,mode,address,comments,items,party_size,requested_date,requested_at,duration_minutes)
 VALUES(bid,request_key_value,hash_value,btrim(payload->>'name'),btrim(payload->>'contact'),payload->>'mode',coalesce(payload->>'address',''),coalesce(payload->>'comments',''),selected,coalesce((payload->>'party_size')::integer,1),nullif(payload->>'requested_date','')::date,public.commerce_time(payload->>'requested_at',m.timezone),least(1440,greatest(5,duration))) RETURNING * INTO r;
 PERFORM public.commerce_log(r,'Cliente');
 RETURN jsonb_build_object('token',r.tracking_token,'id',r.id);
END $$;
CREATE FUNCTION public.commerce_track(token uuid, action text DEFAULT 'get', expected_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r commerce_requests%ROWTYPE; bid uuid; m business_modules%ROWTYPE;
BEGIN
 SELECT business_id INTO bid FROM commerce_requests WHERE tracking_token=token;
 IF bid IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada.'; END IF;
 PERFORM 1 FROM businesses WHERE id=bid FOR UPDATE;
 SELECT * INTO r FROM commerce_requests WHERE tracking_token=token FOR UPDATE;
 SELECT * INTO m FROM business_modules WHERE business_id=bid;
 IF action<>'get' THEN
 IF NOT m.agenda OR NOT EXISTS(SELECT 1 FROM businesses WHERE id=bid AND active) THEN RAISE EXCEPTION 'Contacta al negocio para modificar esta solicitud.'; END IF;
 IF expected_revision IS NULL OR r.revision<>expected_revision THEN RAISE EXCEPTION 'La solicitud cambió. Actualiza para ver la última versión.'; END IF;
 IF r.status IN ('completed','rejected','cancelled') THEN RAISE EXCEPTION 'Esta solicitud ya está cerrada.'; END IF;
 IF action='accept' AND r.status IN ('confirmed','in_progress') THEN r.customer_response:='accepted';
 ELSIF action='change' THEN r.customer_response:='change_requested';
 ELSIF action='cancel' THEN r.status:='cancelled';
 ELSE RAISE EXCEPTION 'Acción no disponible.'; END IF;
 UPDATE commerce_requests SET status=r.status,customer_response=r.customer_response,revision=revision+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 PERFORM public.commerce_log(r,'Cliente');
 END IF;
 RETURN jsonb_build_object('request',to_jsonb(r)-'tracking_token'-'client_hash'-'request_key'-'business_id','business_name',(SELECT name FROM businesses WHERE id=bid),'timezone',m.timezone,
 'events',coalesce((SELECT jsonb_agg(e ORDER BY id) FROM (SELECT id,created_at,actor,snapshot FROM commerce_events WHERE request_id=r.id ORDER BY id DESC LIMIT 100)e),'[]'));
END $$;
CREATE FUNCTION public.commerce_for_card(card_token uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('code',l.public_code,'catalog',m.catalog,'agenda',m.agenda,'catalog_label',m.catalog_label,'agenda_label',m.agenda_label)
 FROM customers c JOIN businesses b ON b.id=c.business_id JOIN business_modules m ON m.business_id=b.id JOIN business_registration_links l ON l.business_id=b.id
 WHERE c.qr_token=card_token AND c.active AND b.active AND m.loyalty
$$;
-- Persist history when a module is disabled. Existing links still show past request status.
-- Prevent loyalty writes even through existing SECURITY DEFINER RPCs.
CREATE FUNCTION public.guard_loyalty_module() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid;
BEGIN
 IF TG_TABLE_NAME IN ('customers','rewards') THEN bid:=NEW.business_id;
 ELSE SELECT business_id INTO bid FROM customers WHERE id=NEW.customer_id; END IF;
 IF NOT public.loyalty_enabled(bid) THEN RAISE EXCEPTION 'El programa de lealtad está desactivado.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER modules_guard_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_module();
CREATE TRIGGER modules_guard_visits BEFORE INSERT ON public.visits FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_module();
CREATE TRIGGER modules_guard_redemptions BEFORE INSERT ON public.redemptions FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_module();
CREATE TRIGGER modules_guard_rewards BEFORE INSERT OR UPDATE ON public.rewards FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_module();
-- Preserve original return type without assumptions about the installed card schema.
DO $$ DECLARE result_type text; BEGIN
 IF to_regprocedure('public.get_loyalty_card(uuid)') IS NOT NULL THEN
 SELECT pg_get_function_result('public.get_loyalty_card(uuid)'::regprocedure) INTO result_type;
 ALTER FUNCTION public.get_loyalty_card(uuid) RENAME TO get_loyalty_card_before_modules;
 REVOKE ALL ON FUNCTION public.get_loyalty_card_before_modules(uuid) FROM PUBLIC,anon,authenticated;
 EXECUTE 'CREATE FUNCTION public.get_loyalty_card(card_token uuid) RETURNS '||result_type||' LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $f$ SELECT * FROM public.get_loyalty_card_before_modules(card_token) WHERE EXISTS(SELECT 1 FROM public.customers c WHERE c.qr_token=card_token AND public.loyalty_enabled(c.business_id)) $f$';
 REVOKE ALL ON FUNCTION public.get_loyalty_card(uuid) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.get_loyalty_card(uuid) TO anon,authenticated,service_role;
 END IF;
END $$;
-- Only scoped RPCs can read or write private requests. No public table grants.
DO $$ DECLARE p record; BEGIN FOR p IN SELECT oid::regprocedure AS f FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'commerce_%' OR proname IN ('loyalty_enabled','guard_loyalty_module')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',p.f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',p.f);
 END LOOP; END $$;
GRANT EXECUTE ON FUNCTION public.commerce_access(uuid,text),public.commerce_manager(uuid),public.commerce_manage(uuid,text,jsonb),public.loyalty_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_public_info(uuid),public.commerce_for_card(uuid) TO anon,authenticated;
COMMIT;
