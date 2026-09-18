-- Enforces upload limits at the storage layer itself, not just client-side.
-- A client-side check is UX only — a modified/malicious client can skip it
-- entirely and call the Storage API directly with the anon key, so the real
-- security boundary has to live here.
update storage.buckets
set
  file_size_limit = 12582912, -- 12MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
where id = 'wardrobe-photos';
