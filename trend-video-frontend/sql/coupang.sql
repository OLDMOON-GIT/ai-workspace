-- ============================================================
-- 쿠팡 파트너스 상품 관련 SQL 쿼리
-- ============================================================

-- @sqlId: getUnregisteredProducts
SELECT
  product_id,
  title,
  price,
  thumbnail,
  deep_link,
  category,
  is_registered,
  created_at
FROM coupang_product
WHERE is_registered = 0
  AND deep_link IS NOT NULL
  AND deep_link != ''
  AND deep_link LIKE '%link.coupang.com/%'
  AND deep_link NOT LIKE '%/re/AFFSDP%'
  AND deep_link NOT LIKE '%?lptag=%'
ORDER BY created_at DESC
LIMIT ?

-- @sqlId: getProductById
SELECT
  product_id,
  title,
  price,
  thumbnail,
  deep_link,
  category,
  is_registered,
  created_at,
  updated_at
FROM coupang_product
WHERE product_id = ?

-- @sqlId: updateProductRegistered
UPDATE coupang_product
SET is_registered = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE product_id = ?

-- @sqlId: insertCoupangProduct
INSERT INTO coupang_product (
  product_id,
  title,
  price,
  thumbnail,
  deep_link,
  category,
  is_registered,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)

-- @sqlId: getProductStats
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN is_registered = 1 THEN 1 ELSE 0 END) as registered,
  SUM(CASE WHEN is_registered = 0 THEN 1 ELSE 0 END) as unregistered
FROM coupang_product

-- @sqlId: getProductsByCategory
SELECT
  product_id,
  title,
  price,
  thumbnail,
  deep_link,
  category,
  is_registered,
  created_at
FROM coupang_product
WHERE category = ?
  AND deep_link IS NOT NULL
  AND deep_link != ''
  AND deep_link LIKE '%link.coupang.com/%'
  AND deep_link NOT LIKE '%/re/AFFSDP%'
  AND deep_link NOT LIKE '%?lptag=%'
ORDER BY created_at DESC
LIMIT ?

-- @sqlId: getAllProducts
SELECT
  product_id,
  title,
  price,
  thumbnail,
  deep_link,
  category,
  is_registered,
  created_at,
  updated_at
FROM coupang_product
WHERE deep_link IS NOT NULL
  AND deep_link != ''
  AND deep_link LIKE '%link.coupang.com/%'
  AND deep_link NOT LIKE '%/re/AFFSDP%'
  AND deep_link NOT LIKE '%?lptag=%'
ORDER BY created_at DESC
LIMIT ? OFFSET ?

-- @sqlId: checkDuplicateProduct
SELECT COUNT(*) as count
FROM coupang_product
WHERE product_id = ?
