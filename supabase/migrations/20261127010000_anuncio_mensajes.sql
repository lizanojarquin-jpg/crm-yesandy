-- Anuncio del que vino el cliente (Click to WhatsApp, Messenger o Instagram).
-- Llega solo en el primer mensaje después de tocar el anuncio. Forma:
-- { "id", "titulo", "texto", "imagen" (ruta en el bucket attachments), "imagen_original",
--   "enlace", "video", "tipo" ("image" | "video") }
alter table public.messages add column ad_referral jsonb
  check (ad_referral is null or jsonb_typeof(ad_referral) = 'object');
