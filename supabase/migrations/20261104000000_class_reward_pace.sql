-- Add the Stage 4 per-class resource pace. Existing classes use the neutral
-- setting, so their future session rewards and caps remain unchanged.
UPDATE classes
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{rewardPace}', '"standard"'::jsonb, true)
WHERE settings->>'rewardPace' IS NULL
   OR settings->>'rewardPace' NOT IN ('relaxed', 'standard', 'boost');
