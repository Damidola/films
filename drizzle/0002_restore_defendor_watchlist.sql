-- Owner requested restoring Defendor to the watchlist. Do not overwrite newer feedback.
UPDATE `taste_feedback` SET `decision` = 'like', `watched` = NULL, `good` = 0, `updated_at` = 1792579958415, `bookmarked_at` = COALESCE(`bookmarked_at`, 1792579958415) WHERE `user_id` = 'single-user' AND `work_id` = 354 AND `updated_at` = 1792579730761;
