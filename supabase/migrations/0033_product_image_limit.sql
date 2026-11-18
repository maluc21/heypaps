update public.plan_limits
set max_images_per_product = 6
where max_images_per_product is distinct from 6;
