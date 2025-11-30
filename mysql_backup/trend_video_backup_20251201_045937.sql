mysqldump: [Warning] Using a password on the command line interface can be insecure.
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: trend_video
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `automation_log`
--

DROP TABLE IF EXISTS `automation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_log` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `pipeline_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_level` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_automation_log_pipeline_id` (`pipeline_id`),
  KEY `idx_automation_log_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `automation_log`
--

LOCK TABLES `automation_log` WRITE;
/*!40000 ALTER TABLE `automation_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `automation_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `automation_setting`
--

DROP TABLE IF EXISTS `automation_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_setting` (
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `automation_setting`
--

LOCK TABLES `automation_setting` WRITE;
/*!40000 ALTER TABLE `automation_setting` DISABLE KEYS */;
INSERT INTO `automation_setting` VALUES ('alert_email','moony75@gmail.com','알림 받을 이메일','2025-11-25 20:32:55'),('auto_title_generation','true',NULL,'2025-11-29 14:28:32'),('check_interval','60','스케줄 체크 간격 (초)','2025-11-25 20:32:55'),('default_youtube_privacy','private','유튜브 기본 공개 설정','2025-11-25 20:32:55'),('enabled','true','자동화 시스템 활성화 여부','2025-11-30 22:35:55'),('max_retry','3','실패 시 최대 재시도 횟수','2025-11-25 20:32:55'),('media_generation_mode','upload','미디어 생성 방식 (upload, dalle, imagen3, sora2)','2025-11-25 20:32:55'),('script_generation_mode','chrome','대본 생성 방식 (api 또는 chrome)','2025-11-25 20:32:55');
/*!40000 ALTER TABLE `automation_setting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `content`
--

DROP TABLE IF EXISTS `content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `content` (
  `content_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('draft','pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `score` int DEFAULT '0',
  `error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `youtube_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `youtube_channel` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `youtube_publish_time` datetime DEFAULT NULL,
  `input_tokens` int DEFAULT NULL,
  `output_tokens` int DEFAULT NULL,
  `source_content_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_model` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prompt_format` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_info` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`content_id`),
  KEY `idx_content_content_id` (`content_id`),
  KEY `idx_content_user_id` (`user_id`),
  KEY `idx_content_status` (`status`),
  CONSTRAINT `content_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `content`
--

LOCK TABLES `content` WRITE;
/*!40000 ALTER TABLE `content` DISABLE KEYS */;
INSERT INTO `content` VALUES ('0767fb33-2708-4f01-9f18-05219821c6c6','b5d1f064-60b9-45ab-9bcd-d36948196459','10년간 연락 끊긴 딸이 본사 부장으로 돌아왔다, 경악스러운 사실','10년간 연락 끊긴 딸이 본사 부장으로 돌아왔다, 경악스러운 사실','failed',96,'오류: 대본 내용이 비어있거나 너무 짧습니다 (22자)',NULL,'UC_pW5DOf3GFn-5dYQMxGYpA',NULL,NULL,NULL,NULL,'claude','longform',NULL,'시니어사연','2025-12-01 01:20:50','2025-12-01 01:23:24'),('0cebffcf-bb3d-4f00-a591-a42a44ab2014','b5d1f064-60b9-45ab-9bcd-d36948196459','가난했던 부모 버린 자식 vs 부자였던 자식들, 15년 만에 역전된 충격의 반전','가난했던 부모 버린 자식 vs 부자였던 자식들, 15년 만에 역전된 충격의 반전','draft',93,NULL,NULL,'UCSJXGGdhQ8kQlG4zsYCBCdQ',NULL,NULL,NULL,NULL,'pattern-sampling-reused','longform',NULL,'북한탈북자사연','2025-12-01 01:20:50','2025-12-01 01:20:50'),('14cec00d-084c-4832-b530-6af8c94b9936','b5d1f064-60b9-45ab-9bcd-d36948196459','충격! 30년간 숨겨온 비밀이 손자, 패닉에 빠졌다','충격! 30년간 숨겨온 비밀이 손자, 패닉에 빠졌다','draft',97,NULL,NULL,'UC_pW5DOf3GFn-5dYQMxGYpA',NULL,NULL,NULL,NULL,'pattern-sampling-reused','longform',NULL,'시니어사연','2025-12-01 01:23:43','2025-12-01 01:23:43'),('4b7fa3c5-75bf-4536-a3c7-c2cf63f29801','b5d1f064-60b9-45ab-9bcd-d36948196459','결혼 10년 만에 재혼한 아버지가 재벌 후계자로 돌아왔다, 대반전','결혼 10년 만에 재혼한 아버지가 재벌 후계자로 돌아왔다, 대반전','draft',100,NULL,NULL,'UCNh_t25SLZYmL0uCjI_gk5w',NULL,NULL,NULL,NULL,'pattern-sampling-reused','longform',NULL,'시니어사연','2025-12-01 01:23:42','2025-12-01 01:23:42'),('6b59c103-5cc0-4317-8ebe-f986d5c81e78','b5d1f064-60b9-45ab-9bcd-d36948196459','모두가 버린 가출했던 아들, 20년 만에 후회의 눈물을 흘렸다','모두가 버린 가출했던 아들, 20년 만에 후회의 눈물을 흘렸다','failed',93,'오류: 대본 내용이 비어있거나 너무 짧습니다 (22자)',NULL,'UCSJXGGdhQ8kQlG4zsYCBCdQ',NULL,NULL,NULL,NULL,'claude','longform',NULL,'북한탈북자사연','2025-12-01 01:24:12','2025-12-01 01:27:12'),('750b392e-9e1d-4495-9b67-eb658df03fff','b5d1f064-60b9-45ab-9bcd-d36948196459','[광고] 더존건강 NFC착즙 100% ABC주스, 2.1L, 1개 - ABC즙 | 쿠팡','[광고] 더존건강 NFC착즙 100% ABC주스, 2.1L, 1개 - ABC즙 | 쿠팡','completed',NULL,NULL,'https://youtu.be/DOjStn5nIFU','UCCP9WVj65HZWREdG9yHQN-g',NULL,NULL,NULL,NULL,'gemini','product','{\"productId\":\"30ab5cf4-a854-4d92-af6f-669461acff75\",\"title\":\"더존건강 NFC착즙 100% ABC주스, 2.1L, 1개 - ABC즙 | 쿠팡\",\"price\":0,\"thumbnail\":\"//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2025/06/11/16/8/faf7f2e1-b743-4d5e-8879-0b9c80e4ae44.jpg\",\"deepLink\":\"https://link.coupang.com/a/c1KQfK\",\"category\":\"상품\"}','상품','2025-12-01 01:31:26','2025-12-01 02:08:48'),('96af3507-1b9c-43f2-8319-da93e571ec5b','b5d1f064-60b9-45ab-9bcd-d36948196459','[광고] 해피제이 겨울 방한 귀마개','[광고] 해피제이 겨울 방한 귀마개','completed',NULL,NULL,NULL,'UCHzVmjofL7WZfcWgvSqe-UQ',NULL,NULL,NULL,NULL,'gemini','product','{\"productId\":\"coupang_1764517871002_b3b341ec83925a4f\",\"title\":\"해피제이 겨울 방한 귀마개\",\"price\":3900,\"thumbnail\":\"https://img1a.coupangcdn.com/image/retail/images/2024/09/24/9/7/7bb38670-245d-4629-ad5f-0719fb5a358a.png\",\"deepLink\":\"https://link.coupang.com/a/c9ru5D\",\"category\":\"상품\"}','상품','2025-12-01 01:41:14','2025-12-01 01:42:28'),('a7c6a5ee-5a2b-4637-8281-1d44ef60ad92','b5d1f064-60b9-45ab-9bcd-d36948196459','[광고] 롯데자일리톨 오리지날 껌 리필, 115g, 6개 - 풍선/버블껌 | 쿠팡','[광고] 롯데자일리톨 오리지날 껌 리필, 115g, 6개 - 풍선/버블껌 | 쿠팡','draft',NULL,NULL,NULL,'UCCP9WVj65HZWREdG9yHQN-g',NULL,NULL,NULL,NULL,'gemini','product','{\"productId\":\"0e455fb1-9448-4548-852a-0a128f4cb7a2\",\"title\":\"롯데자일리톨 오리지날 껌 리필, 115g, 6개 - 풍선/버블껌 | 쿠팡\",\"price\":0,\"thumbnail\":\"//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/9071704218831-2297e2ab-a13d-4e61-9bb9-651c07993f98.jpg\",\"deepLink\":\"https://link.coupang.com/a/c1KsH5\",\"category\":\"상품\"}','상품','2025-12-01 01:11:20','2025-12-01 01:11:20'),('b3574c31-e0c8-4f60-8c98-ebcff8d321ef','b5d1f064-60b9-45ab-9bcd-d36948196459','20년 만에 첫째 아들이 보낸 편지, 드러난 진실','20년 만에 첫째 아들이 보낸 편지, 드러난 진실','draft',96,NULL,NULL,'UCSJXGGdhQ8kQlG4zsYCBCdQ',NULL,NULL,NULL,NULL,'pattern-sampling-reused','longform',NULL,'북한탈북자사연','2025-12-01 01:23:43','2025-12-01 01:23:43'),('be0f2db0-b246-4e2c-b2a0-7e705b75fb00','b5d1f064-60b9-45ab-9bcd-d36948196459','1년 후 노인정 할머니들이 본사 부장으로 돌아왔다, 대반전','1년 후 노인정 할머니들이 본사 부장으로 돌아왔다, 대반전','draft',96,NULL,NULL,'UCNh_t25SLZYmL0uCjI_gk5w',NULL,NULL,NULL,NULL,'pattern-sampling-reused','longform',NULL,'시니어사연','2025-12-01 01:20:50','2025-12-01 01:20:50'),('beead99d-f994-45fa-9097-4c199a48aa7b','b5d1f064-60b9-45ab-9bcd-d36948196459','[광고] 로에드 3세대 필터형 1080도 워터탭 수전탭 회전식 수도 연장탭 - 세면대부속품 | 쿠팡','[광고] 로에드 3세대 필터형 1080도 워터탭 수전탭 회전식 수도 연장탭 - 세면대부속품 | 쿠팡','completed',NULL,NULL,NULL,'UCZ-DUBUAV53zBuiK-3bYfEg',NULL,NULL,NULL,NULL,'gemini','product','{\"productId\":\"66d39e29-64fa-4833-ad6c-31089b88f009\",\"title\":\"로에드 3세대 필터형 1080도 워터탭 수전탭 회전식 수도 연장탭 - 세면대부속품 | 쿠팡\",\"price\":0,\"thumbnail\":\"https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/e062/8451da1a88ee4bed846d23316830582f58a1304774b7a6e51fd24e05c3f5.png\",\"deepLink\":\"https://link.coupang.com/a/c2DG4f\",\"category\":\"상품\"}','상품','2025-12-01 01:41:53','2025-12-01 02:13:36'),('cc67b68d-5579-42e4-bd58-b43e14cb5a39','b5d1f064-60b9-45ab-9bcd-d36948196459','[광고] 통수산 최상급 당일수확 통영 생굴 대굴 - 굴 | 쿠팡','[광고] 통수산 최상급 당일수확 통영 생굴 대굴 - 굴 | 쿠팡','failed',NULL,'pipelineId is not defined',NULL,'UCZ-DUBUAV53zBuiK-3bYfEg',NULL,NULL,NULL,NULL,'gemini','product','{\"productId\":\"dcc9cc33-6eea-403d-8f89-5eea5b1d99fe\",\"title\":\"통수산 최상급 당일수확 통영 생굴 대굴 - 굴 | 쿠팡\",\"price\":20000,\"thumbnail\":\"https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/c02f/cf38617070e294ce6dc044bafbc17650afa1189d40e2fa78584a82e88a89.png\",\"deepLink\":\"https://link.coupang.com/a/c2JUYj\",\"category\":\"상품\"}','상품','2025-12-01 02:35:59','2025-12-01 03:33:03'),('eb48a698-2936-44ea-9a19-1d1ec275b742','b5d1f064-60b9-45ab-9bcd-d36948196459','\"나 홀로된 어머니이야\" 결혼 10년 만에 나타난 그 사람, 드러난 진실','\"나 홀로된 어머니이야\" 결혼 10년 만에 나타난 그 사람, 드러난 진실','failed',96,'오류: 대본 내용이 비어있거나 너무 짧습니다 (22자)',NULL,'UC_pW5DOf3GFn-5dYQMxGYpA',NULL,NULL,NULL,NULL,'claude','longform',NULL,'시니어사연','2025-12-01 01:24:07','2025-12-01 01:24:47');
/*!40000 ALTER TABLE `content` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `content_setting`
--

DROP TABLE IF EXISTS `content_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `content_setting` (
  `content_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `script_mode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_mode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tts_voice` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ko-KR-SoonBokNeural',
  `tts_speed` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '+0%',
  `auto_create_shortform` tinyint DEFAULT '0',
  `tags` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `settings` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `youtube_privacy` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'private',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`content_id`),
  CONSTRAINT `content_setting_ibfk_1` FOREIGN KEY (`content_id`) REFERENCES `content` (`content_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `content_setting`
--

LOCK TABLES `content_setting` WRITE;
/*!40000 ALTER TABLE `content_setting` DISABLE KEYS */;
INSERT INTO `content_setting` VALUES ('0767fb33-2708-4f01-9f18-05219821c6c6','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:20:50','2025-12-01 01:20:50'),('0cebffcf-bb3d-4f00-a591-a42a44ab2014','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:20:50','2025-12-01 01:20:50'),('14cec00d-084c-4832-b530-6af8c94b9936','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:23:43','2025-12-01 01:23:43'),('4b7fa3c5-75bf-4536-a3c7-c2cf63f29801','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:23:43','2025-12-01 01:23:43'),('6b59c103-5cc0-4317-8ebe-f986d5c81e78','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:24:12','2025-12-01 01:24:12'),('750b392e-9e1d-4495-9b67-eb658df03fff','chrome','crawl','ko-KR-SunHiNeural','+0%',0,'상품,쿠팡,식품',NULL,'public','2025-12-01 01:31:26','2025-12-01 01:31:27'),('96af3507-1b9c-43f2-8319-da93e571ec5b','chrome','crawl','ko-KR-SunHiNeural','+0%',0,'상품,쿠팡,스포츠',NULL,'public','2025-12-01 01:41:14','2025-12-01 01:41:14'),('a7c6a5ee-5a2b-4637-8281-1d44ef60ad92','chrome','crawl','ko-KR-SunHiNeural','+0%',0,'상품,쿠팡,식품',NULL,'public','2025-12-01 01:11:20','2025-12-01 01:11:20'),('b3574c31-e0c8-4f60-8c98-ebcff8d321ef','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:23:43','2025-12-01 01:23:43'),('be0f2db0-b246-4e2c-b2a0-7e705b75fb00','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:20:50','2025-12-01 01:20:50'),('beead99d-f994-45fa-9097-4c199a48aa7b','chrome','crawl','ko-KR-SunHiNeural','+0%',0,'상품,쿠팡,생활용품',NULL,'public','2025-12-01 01:41:53','2025-12-01 01:41:53'),('cc67b68d-5579-42e4-bd58-b43e14cb5a39','chrome','crawl','ko-KR-SunHiNeural','+0%',0,'상품,쿠팡,식품',NULL,'public','2025-12-01 02:35:59','2025-12-01 02:35:59'),('eb48a698-2936-44ea-9a19-1d1ec275b742','chrome','crawl','ko-KR-SoonBokNeural','+0%',1,NULL,NULL,'private','2025-12-01 01:24:07','2025-12-01 01:24:07');
/*!40000 ALTER TABLE `content_setting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coupang_crawl_queue`
--

DROP TABLE IF EXISTS `coupang_crawl_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupang_crawl_queue` (
  `queue_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `retry_count` int DEFAULT '0',
  `max_retries` int DEFAULT '3',
  `timeout_seconds` int DEFAULT '60',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `product_info` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `custom_category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destination` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'my_list',
  `source_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`queue_id`),
  KEY `idx_coupang_crawl_queue_user_id` (`user_id`),
  KEY `idx_coupang_crawl_queue_status` (`status`),
  CONSTRAINT `coupang_crawl_queue_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coupang_crawl_queue`
--

LOCK TABLES `coupang_crawl_queue` WRITE;
/*!40000 ALTER TABLE `coupang_crawl_queue` DISABLE KEYS */;
/*!40000 ALTER TABLE `coupang_crawl_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coupang_product`
--

DROP TABLE IF EXISTS `coupang_product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupang_product` (
  `coupang_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `product_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `deep_link` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `original_price` int DEFAULT NULL,
  `discount_price` int DEFAULT NULL,
  `rocket_shipping` tinyint DEFAULT '0',
  `free_shipping` tinyint DEFAULT '0',
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `view_count` int DEFAULT '0',
  `click_count` int DEFAULT '0',
  `is_favorite` tinyint DEFAULT '0',
  `queue_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`coupang_id`),
  KEY `idx_coupang_product_user_id` (`user_id`),
  KEY `idx_coupang_product_product_id` (`product_id`),
  CONSTRAINT `coupang_product_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coupang_product`
--

LOCK TABLES `coupang_product` WRITE;
/*!40000 ALTER TABLE `coupang_product` DISABLE KEYS */;
INSERT INTO `coupang_product` VALUES ('0e455fb1-9448-4548-852a-0a128f4cb7a2','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'롯데자일리톨 오리지날 껌 리필, 115g, 6개 - 풍선/버블껌 | 쿠팡','건강하고 상쾌한 씹는 즐거움을 선사하는 롯데자일리톨 오리지날 껌 리필!\n\n일상 속 작은 즐거움을 더하고 싶으신가요? 이 롯데자일리톨 오리지날 껌은 완벽한 선택이 될 것입니다. 향긋한 풍미와 부드러운 식감으로 입안을 상쾌하게 깨워줍니다. 게다가 자일리톨 성분이 함유되어 치아 건강까지 챙겨줘 일거양득의 혜택을 누릴 수 있습니다.\n\n최고의 품질과 엄격한 품질 관리로 제작된 이 제품은 지금 쿠팡에서 더욱 저렴한 가격으로 만나볼 수 있습니다. 풍선껌과 버블껌 등 다양한 종류의 제품들도 함께 제공되어 입맛에 따라 선택할 수 있습니다. 쿠팡에서 지금 바로 장바구니에 담아보세요!','식품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/9071704218831-2297e2ab-a13d-4e61-9bb9-651c07993f98.jpg','https://link.coupang.com/a/c1KsH5','https://link.coupang.com/a/c1KsH5',NULL,NULL,0,0,'active',0,0,1,NULL,'2025-11-05 15:38:29','2025-11-10 14:16:32'),('161325fa-fc69-4b8e-998c-963a97a17d51','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'아이리버 클립 LED 북라이트 다용도 핸디 랜턴 ICL-100 - 북라이트 | 쿠팡','현재 별점 4.8점, 리뷰 184개를 가진 아이리버 클립 LED 북라이트 다용도 핸디 랜턴 ICL-100! 지금 쿠팡에서 더 저렴하고 다양한 북라이트 제품들을 확인해보세요.','생활용품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2025/07/04/9/5/7cd54d80-7b58-4d58-bc34-61af650c5027.jpg','https://link.coupang.com/a/c2DEt3','https://link.coupang.com/a/c2DEt3',NULL,NULL,0,0,'active',0,0,0,'0eacff89-4890-4eb9-8c8f-e1ddd12b5a47','2025-11-08 15:38:19','2025-11-10 14:16:28'),('1ad98055-4c2d-4562-aafd-b39fdc4263a0','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'아보카도 생과, 180g 내외(중과..., 10개 - 아보카도 | 쿠팡','상품 설명:\n\n건강한 먹거리에 관심이 있다면 이 아보카도 생과는 주목할 만한 선택이 될 것입니다. 아보카도는 다양한 영양소와 건강 효과를 가진 슈퍼푸드로 알려져 있죠. 이 제품은 180g 내외의 중과로 10개가 포함되어 있어 가족이나 소규모 모임에서도 충분히 즐길 수 있습니다.\n\n특히 이 아보카도는 신선도와 품질이 뛰어나 맛과 영양을 모두 담고 있습니다. 아보카도에 풍부한 불포화지방산, 비타민, 미네랄 등은 건강한 피부와 혈액 순환, 면역력 강화에 도움을 줄 수 있습니다. 또한 포만감이 좋아 다이어트에도 활용할 수 있죠.\n\n현재 쿠팡에서 판매 중인 이 아보카도는 합리적인 가격에 구매할 수 있어 더욱 매력적입니다. 신선하고 영양가 높은 아보카도로 건강한 식단을 구성하고 싶으시다면 지금 바로 구매해보세요.','식품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/b8db/6d7776537f25aed6cf31582159f5e5fceebe64ea64c0c231a13e2570a080.jpg','https://link.coupang.com/a/c1KMo8','https://link.coupang.com/a/c1KMo8',NULL,NULL,0,0,'active',0,0,1,NULL,'2025-11-05 16:21:02','2025-11-10 14:16:31'),('203d49c2-c4f4-4ca3-896f-610e03fe43c6','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'휘레쉬박스 한손 계란 치는 기계 수동 반자동 믹서 다기능 휘핑크림 휘핑 도구 - 핸드블렌더 | 쿠팡','일상 생활에서 필요한 다양한 조리 작업을 간편하게 해결할 수 있는 휘레쉬박스 한손 계란 치는 기계를 소개합니다. 이 멀티 기능 제품은 계란 및 크림 휘핑, 부드러운 드레싱 제조 등 다양한 조리 작업을 한 손으로 쉽게 처리할 수 있습니다.\n\n특히 수동 반자동 방식으로 작동되어 어린아이나 노약자도 안전하게 사용할 수 있습니다. 또한 휘핑 작업 시 별도의 전기 기기 없이도 부드러운 크림을 만들 수 있어 편리합니다. 시간을 절약하고 노력을 최소화하면서도 맛있는 요리를 만들 수 있는 이 제품은 바쁜 일상 속에서 가정주부들의 필수품이 될 것입니다.\n\n지금 바로 쿠팡에서 할인된 가격으로 구매하세요. 이 제품 하나면 다양한 조리 작업을 간편하게 해결할 수 있어 주방 생활이 한결 편해질 것입니다. 가족 여러분의 행복한 식사 시간을 위해 이 멀티 기능 도구를 지금 바로 장바구니에 담아보세요.','생활용품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/ceaf/60ae6e25388ce6a74681048756f68f4537e97a6827fa2e064b648fc8013d.jpg','https://link.coupang.com/a/c1BMTS','https://link.coupang.com/a/c1BMTS',NULL,NULL,0,0,'active',0,0,0,NULL,'2025-11-05 13:09:25','2025-11-10 14:16:34'),('30ab5cf4-a854-4d92-af6f-669461acff75','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'더존건강 NFC착즙 100% ABC주스, 2.1L, 1개 - ABC즙 | 쿠팡','더존건강 NFC착즙 100% ABC주스, 2.1L, 1개 - 건강한 습관을 위한 최적의 선택!\n\n건강과 자연의 가치를 추구하는 분들께 드리는 필수품, 더존건강 NFC착즙 ABC주스입니다. 이 제품은 신선한 사과, 당근, 비트를 선별하여 최대한의 영양분을 그대로 담아낸 천연 주스입니다. 일반적인 가공 주스와 달리 열처리 없이 저온 착즙 방식을 사용하여 영양 성분과 원래의 맛을 그대로 보존하고 있습니다.\n\n이 ABC주스는 단 한 방울의 첨가물도 없는 100% 순수 천연 주스입니다. 각 재료에 함유된 비타민, 미네랄, 식이섬유 등의 풍부한 영양분을 한 번에 섭취할 수 있어 바쁜 현대인들의 건강한 생활 습관 형성에 도움을 줄 것입니다. 또한 2.1리터 대용량 패키지로 언제 어디서나 손쉽게 즐길 수 있습니다. 건강하고 행복한 하루를 위해 지금 바로 더존건강 NFC착즙 ABC주스를 경험해보세요.','식품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/2025/06/11/16/8/faf7f2e1-b743-4d5e-8879-0b9c80e4ae44.jpg','https://link.coupang.com/a/c1KQfK','https://link.coupang.com/a/c1KQfK',NULL,NULL,0,0,'active',0,0,1,NULL,'2025-11-05 16:47:15','2025-11-10 14:16:30'),('4947d085-4257-4f4d-99b7-aba99202ab47','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'신지모루 Qi2 3in1 무선충전 맥세이프 M 윙 터보 갤럭시 워치 거치대 - 충전기 | 쿠팡','현재 별점 4.5점, 리뷰 949개를 가진 신지모루 Qi2 3in1 무선충전 맥세이프 M 윙 터보 갤럭시 워치 거치대! 지금 쿠팡에서 더 저렴하고 다양한 충전기 제품들을 확인해보세요.','디지털','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/344522090099043-221bb615-0cab-4239-916c-53ddb30aec33.jpg','https://link.coupang.com/a/c2DFxF','https://link.coupang.com/a/c2DFxF',NULL,NULL,0,0,'active',0,0,0,'252b353c-1868-4e46-8c8e-b3e73ee1452f','2025-11-08 15:38:12','2025-11-10 14:16:29'),('522d0993-f0fa-4f6d-9f96-7119ec699993','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'페레로 페레로로쉐 T3 3개입, 38g, 48개 - 초콜릿/캔디세트 | 쿠팡','현재 별점 4.6점, 리뷰 266개를 가진 페레로 페레로로쉐 T3 3개입, 38g, 48개! 지금 쿠팡에서 더 저렴하고 다양한 초콜릿/캔디세트 제품들을 확인해보세요.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/2ccc/18114d68d374fa8c56b776594bf436bdfbcfe0a84ed63856f925121020fe.png','https://link.coupang.com/a/c24xvk','https://link.coupang.com/a/c24xvk',NULL,34000,0,0,'active',0,0,1,'ea3da6b7-9180-4810-9562-0567c9321f54','2025-11-10 09:02:41','2025-11-10 14:16:23'),('5655f6c0-e0e8-4ea1-bbe0-4a15617825cf','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'샘물수산 포항 구룡포 햇과메기철 - 과메기 | 쿠팡','현재 별점 4.4점, 리뷰 2492개를 가진 샘물수산 포항 구룡포 햇과메기철! 지금 쿠팡에서 더 저렴하고 다양한 과메기 제품들을 확인해보세요.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/d672/98cc4d053e4f9832fcf05f13b2f9d370542b1fc3baf8cf82900d0d106a15.jpg','https://link.coupang.com/a/c24tNv','https://link.coupang.com/a/c24tNv',NULL,17750,0,0,'active',0,0,0,'309638f5-c31e-415e-9827-e37449772919','2025-11-10 08:58:17','2025-11-10 14:16:24'),('618a28a7-3a8b-49a5-9e45-9f2bec381087','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'국산 스텐 찜기 중 업소용 고구마 감자 찜 조리도구 스텐 제질, 1개 - 찜냄비 | 쿠팡','완벽한 식사 준비를 위한 필수품, 국산 스텐 찜기!\n\n오늘 특별한 요리를 준비하시나요? 그렇다면 이 국산 스텐 찜기 하나면 충분합니다! 고구마와 감자는 물론, 각종 건강한 재료들을 쉽고 간편하게 찌실 수 있는 이 찜기는 업소용 수준의 내구성과 품질을 자랑합니다. 스테인리스 스틸 재질로 제작되어 위생적이고 내구성이 뛰어나 오랫동안 사용하실 수 있습니다. \n\n또한 사용이 간편하고 다양한 크기의 재료도 손쉽게 찔 수 있어 편리합니다. 가족 모두가 즐길 수 있는 건강한 요리를 만들어보세요. 지금 바로 쿠팡에서 이 찜기를 만나보시고 맛있는 식사 시간을 가져보세요!','생활용품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/267c/91b22310777c8ff5d59acd90f990f423e0c6f822cefc7635c543dfdb5948.png','https://link.coupang.com/a/c1IOOT','https://link.coupang.com/a/c1IOOT',NULL,NULL,0,0,'active',0,0,0,NULL,'2025-11-05 14:09:22','2025-11-10 14:16:33'),('6347e569-2d74-40ad-9559-63213fa9f06f','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'비안 겨울 스포츠 터치 스키장갑 - 장갑 | 쿠팡','현재 별점 5.0점, 리뷰 239개를 가진 비안 겨울 스포츠 터치 스키장갑! 지금 쿠팡에서 더 저렴하고 다양한 장갑 제품들을 확인해보세요.','스포츠','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/retail/images/23647110276155-97cc16d9-f3eb-4500-9b3b-bf34ff4eafd5.jpg','https://link.coupang.com/a/c2NzYO','https://link.coupang.com/a/c2NzYO',NULL,8900,0,0,'active',0,0,0,'4c294cfd-32ea-4718-9a27-78e8ce8f4331','2025-11-09 06:26:34','2025-11-10 14:16:24'),('66d39e29-64fa-4833-ad6c-31089b88f009','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'로에드 3세대 필터형 1080도 워터탭 수전탭 회전식 수도 연장탭 - 세면대부속품 | 쿠팡','현재 별점 4.7점, 리뷰 234개를 가진 로에드 3세대 필터형 1080도 워터탭 수전탭 회전식 수도 연장탭! 지금 쿠팡에서 더 저렴하고 다양한 세면대부속품 제품들을 확인해보세요.','생활용품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/e062/8451da1a88ee4bed846d23316830582f58a1304774b7a6e51fd24e05c3f5.png','https://link.coupang.com/a/c2DG4f','https://link.coupang.com/a/c2DG4f',NULL,NULL,0,0,'active',0,0,0,'ac3237d5-c5ab-4db3-ac86-5c87433cb336','2025-11-08 15:38:17','2025-11-10 14:16:28'),('ac99f3d9-f1a3-400b-aad9-fe3e4545e9eb','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'당일조업 제철 통영굴 산지 생굴 1kg 세척 굴(오후 6시 이전 주문 당일발송), 생굴1kg, 1개 - 굴 | 쿠팡','쿠팡에서 당일조업 제철 통영굴 산지 생굴 1kg 세척 굴(오후 6시 이전 주문 당일발송), 생굴1kg, 1개 구매하고 더 많은 혜택을 받으세요! 지금 할인중인 다른 굴 제품도 바로 쿠팡에서 확인할 수 있습니다.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/419f/d5c62872ba74793c53482f0b987eb1d88eb4cd7134c20367efde54711769.jpg','https://link.coupang.com/a/c2JWId','https://link.coupang.com/a/c2JWId',NULL,14940,0,0,'active',0,0,1,'7dfc00ee-7d9c-4898-87d3-01fec61b77c3','2025-11-09 04:03:53','2025-11-10 14:16:27'),('coupang_1764517871002_b3b341ec83925a4f','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'해피제이 겨울 방한 귀마개','해피제이 겨울 방한 귀마개 - 스포츠/레저용품','스포츠','https://img1a.coupangcdn.com/image/retail/images/2024/09/24/9/7/7bb38670-245d-4629-ad5f-0719fb5a358a.png','https://link.coupang.com/re/AFFSDP?lptag=AF5835292&pageKey=7610302552&itemId=20153905492&vendorItemId=91169120924&traceid=V0-113-8af73780820e807d','https://link.coupang.com/a/c9ru5D',3900,3900,0,0,'active',0,0,0,NULL,'2025-12-01 00:51:11','2025-12-01 00:51:11'),('d0f6f549-f13a-4481-8153-371136bd6c65','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'빼빼로 아몬드, 132g, 2개 - 빼빼로/막대과자 | 쿠팡','현재 별점 4.7점, 리뷰 55971개를 가진 빼빼로 아몬드, 132g, 2개! 지금 쿠팡에서 더 저렴하고 다양한 빼빼로/막대과자 제품들을 확인해보세요.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/1025_amir_coupang_oct_80k/f6ab/7597b23a7ba4c28c83278d01dc8d709a5b520fc702ffe40dad84a7c01d10.jpg','https://link.coupang.com/a/c24Fea','https://link.coupang.com/a/c24Fea',NULL,8390,0,0,'active',0,0,0,'aff90d79-f9a3-4edc-86da-b0b65693c6f9','2025-11-10 11:06:14','2025-11-10 14:16:22'),('dcc9cc33-6eea-403d-8f89-5eea5b1d99fe','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'통수산 최상급 당일수확 통영 생굴 대굴 - 굴 | 쿠팡','현재 별점 4.4점, 리뷰 6953개를 가진 통수산 최상급 당일수확 통영 생굴 대굴! 지금 쿠팡에서 더 저렴하고 다양한 굴 제품들을 확인해보세요.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/c02f/cf38617070e294ce6dc044bafbc17650afa1189d40e2fa78584a82e88a89.png','https://link.coupang.com/a/c2JUYj','https://link.coupang.com/a/c2JUYj',NULL,20000,0,0,'active',0,0,1,'bec5949e-6a2f-4401-9848-f1da9ec5665d','2025-11-09 04:03:54','2025-11-10 14:16:25'),('e2b7c3b5-5276-4001-a940-a3b6a0f3b5d9','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'큐티 1+1병아리 무드등 LED 수면등 신생아 수유등 - 무드등 | 쿠팡','현재 별점 4.8점, 리뷰 155개를 가진 큐티 1+1병아리 무드등 LED 수면등 신생아 수유등! 지금 쿠팡에서 더 저렴하고 다양한 무드등 제품들을 확인해보세요.','생활용품','//thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/5a5c/4568881e0fd7e0fab219ad258ae91b55fa011edd41fd7c44e74d739c2ffa.jpg','https://link.coupang.com/a/c2ufG7','https://link.coupang.com/a/c2ufG7',NULL,NULL,0,0,'active',0,1,0,NULL,'2025-11-08 03:31:07','2025-11-10 14:16:29'),('e9892559-d5e6-40b9-a51a-b590ff2cf033','b5d1f064-60b9-45ab-9bcd-d36948196459',NULL,'포항 구룡포 우리덕장 반건조 과메기, 5미 단품 (야채없..., 1박스 - 과메기 | 쿠팡','쿠팡에서 포항 구룡포 우리덕장 반건조 과메기, 5미 단품 (야채없..., 1박스 구매하고 더 많은 혜택을 받으세요! 지금 할인중인 다른 과메기 제품도 바로 쿠팡에서 확인할 수 있습니다.','식품','https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/vendor_inventory/b441/bf015e2919a3fe2c66411be00ce0a0ef3428eb1800e9f84c0e83e85ea5bf.png','https://link.coupang.com/a/c2J3QU','https://link.coupang.com/a/c2J3QU',NULL,13800,0,0,'active',0,0,0,'5298eb5a-c173-4dc3-9cc1-c5d44e1cfcd2','2025-11-09 04:03:53','2025-11-10 14:16:26');
/*!40000 ALTER TABLE `coupang_product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_crawl_link`
--

DROP TABLE IF EXISTS `product_crawl_link`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_crawl_link` (
  `link_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `original_price` decimal(15,2) DEFAULT NULL,
  `discount_price` decimal(15,2) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`link_id`),
  KEY `idx_product_crawl_link_user_id` (`user_id`),
  KEY `idx_product_crawl_link_status` (`status`),
  CONSTRAINT `product_crawl_link_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_crawl_link`
--

LOCK TABLES `product_crawl_link` WRITE;
/*!40000 ALTER TABLE `product_crawl_link` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_crawl_link` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_crawl_link_history`
--

DROP TABLE IF EXISTS `product_crawl_link_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_crawl_link_history` (
  `history_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `hostname` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_result_count` int DEFAULT '0',
  `last_duplicate_count` int DEFAULT '0',
  `last_error_count` int DEFAULT '0',
  `last_total_links` int DEFAULT '0',
  `last_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `last_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `last_job_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_crawled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_product_crawl_link_history_user_id` (`user_id`),
  CONSTRAINT `product_crawl_link_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_crawl_link_history`
--

LOCK TABLES `product_crawl_link_history` WRITE;
/*!40000 ALTER TABLE `product_crawl_link_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_crawl_link_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_crawl_link_pending`
--

DROP TABLE IF EXISTS `product_crawl_link_pending`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_crawl_link_pending` (
  `pending_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `image_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `original_price` int DEFAULT NULL,
  `discount_price` int DEFAULT NULL,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `crawl_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'not_crawled',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `video_ready` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pending_id`),
  KEY `idx_product_crawl_link_pending_user_id` (`user_id`),
  KEY `idx_product_crawl_link_pending_status` (`status`),
  CONSTRAINT `product_crawl_link_pending_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_crawl_link_pending`
--

LOCK TABLES `product_crawl_link_pending` WRITE;
/*!40000 ALTER TABLE `product_crawl_link_pending` DISABLE KEYS */;
/*!40000 ALTER TABLE `product_crawl_link_pending` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task`
--

DROP TABLE IF EXISTS `task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task` (
  `task_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','active','completed','archived','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_user_id` (`user_id`),
  KEY `idx_task_status` (`status`),
  CONSTRAINT `task_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task`
--

LOCK TABLES `task` WRITE;
/*!40000 ALTER TABLE `task` DISABLE KEYS */;
INSERT INTO `task` VALUES ('6b59c103-5cc0-4317-8ebe-f986d5c81e78','cancelled','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:24:12','2025-12-01 01:27:14'),('750b392e-9e1d-4495-9b67-eb658df03fff','draft','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:31:26','2025-12-01 01:31:26'),('96af3507-1b9c-43f2-8319-da93e571ec5b','draft','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:41:14','2025-12-01 01:41:14'),('beead99d-f994-45fa-9097-4c199a48aa7b','draft','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:41:53','2025-12-01 01:41:53'),('cc67b68d-5579-42e4-bd58-b43e14cb5a39','cancelled','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 02:35:59','2025-12-01 02:42:58'),('eb48a698-2936-44ea-9a19-1d1ec275b742','draft','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:24:07','2025-12-01 01:24:07');
/*!40000 ALTER TABLE `task` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_lock`
--

DROP TABLE IF EXISTS `task_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_lock` (
  `task_type` enum('script','image','video','youtube') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `locked_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `worker_pid` int DEFAULT NULL,
  PRIMARY KEY (`task_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_lock`
--

LOCK TABLES `task_lock` WRITE;
/*!40000 ALTER TABLE `task_lock` DISABLE KEYS */;
INSERT INTO `task_lock` VALUES ('',NULL,NULL,NULL),('script',NULL,NULL,NULL),('image',NULL,NULL,NULL),('video',NULL,NULL,NULL),('youtube',NULL,NULL,NULL);
/*!40000 ALTER TABLE `task_lock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_queue`
--

DROP TABLE IF EXISTS `task_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_queue` (
  `task_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('schedule','script','image','video','youtube') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('waiting','processing','completed','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'waiting',
  `created_at` datetime NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `elapsed_time` int DEFAULT NULL,
  `script_completed_at` datetime DEFAULT NULL,
  `image_completed_at` datetime DEFAULT NULL,
  `video_completed_at` datetime DEFAULT NULL,
  `youtube_completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_queue_type_status` (`type`,`status`,`created_at`),
  KEY `idx_task_queue_user_status` (`user_id`,`status`),
  KEY `idx_task_queue_task_id` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_queue`
--

LOCK TABLES `task_queue` WRITE;
/*!40000 ALTER TABLE `task_queue` DISABLE KEYS */;
INSERT INTO `task_queue` VALUES ('6b59c103-5cc0-4317-8ebe-f986d5c81e78','script','failed','2025-12-01 01:24:12','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:25:17','2025-12-01 01:27:13','Script generation failed: Script generation failed: 오류: 대본 내용이 비어있거나 너무 짧습니다 (22자)',115957,NULL,NULL,NULL,NULL),('750b392e-9e1d-4495-9b67-eb658df03fff','youtube','failed','2025-12-01 01:38:12','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:51:17','2025-12-01 01:51:18','YouTube upload failed: YouTube upload failed: {\"error\":\"인증 실패\",\"details\":\"상세 정보 없음\",\"stdout\":\"[ERROR] 인증 실패: (\'invalid_grant: Token has been expired or revoked.\', {\'error\': \'invalid_grant\', \'error_description\': \'Token has been expired or revoked.\'})\\n{\\\"success\\\": false, \\\"error\\\": \\\"\\\\uc778\\\\uc99d \\\\uc2e4\\\\ud328\\\"}\\n\",\"stderr\":\"\"}',1282,'2025-12-01 01:39:14','2025-12-01 01:44:17','2025-12-01 01:50:34',NULL),('96af3507-1b9c-43f2-8319-da93e571ec5b','video','failed','2025-12-01 01:41:17','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:47:17','2025-12-01 01:47:17','Video generation failed: The \"path\" argument must be of type string. Received undefined',75755,'2025-12-01 01:42:28','2025-12-01 01:47:17',NULL,NULL),('beead99d-f994-45fa-9097-4c199a48aa7b','youtube','failed','2025-12-01 01:41:57','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 02:26:17','2025-12-01 02:26:17','YouTube upload failed: YouTube upload failed: {\"error\":\"인증 실패\",\"details\":\"YouTube 토큰 파일을 찾을 수 없습니다. 채널을 다시 연결해주세요.\",\"tokenPath\":\"C:\\\\Users\\\\oldmoon\\\\workspace\\\\trend-video-backend\\\\config\\\\youtube_token_b5d1f064-60b9-45ab-9bcd-d36948196459_UCZ-DUBUAV53zBuiK-3bYfEg.json\"}',240,'2025-12-01 01:44:10','2025-12-01 01:51:17','2025-12-01 02:13:36',NULL),('cc67b68d-5579-42e4-bd58-b43e14cb5a39','youtube','failed','2025-12-01 02:36:06','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 03:33:03','2025-12-01 03:33:03','pipelineId is not defined',219,'2025-12-01 02:37:14','2025-12-01 02:48:17','2025-12-01 02:59:35',NULL),('eb48a698-2936-44ea-9a19-1d1ec275b742','script','failed','2025-12-01 01:24:07','b5d1f064-60b9-45ab-9bcd-d36948196459','2025-12-01 01:24:16','2025-12-01 01:24:52','Script generation failed: Script generation failed: 오류: 대본 내용이 비어있거나 너무 짧습니다 (22자)',35334,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `task_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_schedule`
--

DROP TABLE IF EXISTS `task_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_schedule` (
  `schedule_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_time` datetime NOT NULL,
  `youtube_publish_time` datetime DEFAULT NULL,
  `status` enum('pending','processing','completed','failed','cancelled','waiting_for_upload') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `failed_stage` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `retry_count` int DEFAULT '0',
  `shortform_task_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parent_youtube_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shortform_uploaded` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  KEY `idx_task_schedule_task_id` (`task_id`),
  KEY `idx_task_schedule_scheduled_time` (`scheduled_time`),
  CONSTRAINT `task_schedule_ibfk_1` FOREIGN KEY (`task_id`) REFERENCES `task` (`task_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_schedule`
--

LOCK TABLES `task_schedule` WRITE;
/*!40000 ALTER TABLE `task_schedule` DISABLE KEYS */;
INSERT INTO `task_schedule` VALUES ('431e158d-0577-4aaf-842e-52e7e9fbce90','beead99d-f994-45fa-9097-4c199a48aa7b',NULL,'2025-12-01 01:41:56',NULL,'completed',NULL,NULL,0,NULL,NULL,0,'2025-12-01 01:41:53','2025-12-01 02:13:36'),('59da532a-276e-4bef-8ff6-c8dbe1a981f3','cc67b68d-5579-42e4-bd58-b43e14cb5a39',NULL,'2025-12-01 02:36:06',NULL,'failed','pipelineId is not defined',NULL,0,NULL,NULL,0,'2025-12-01 02:35:59','2025-12-01 03:33:03'),('7befbe84-b2aa-49bf-89bb-18dc669735f9','750b392e-9e1d-4495-9b67-eb658df03fff',NULL,'2025-12-01 01:38:12',NULL,'completed',NULL,NULL,0,NULL,NULL,0,'2025-12-01 01:31:26','2025-12-01 01:50:34'),('856fbadc-967a-4fbf-88cf-cca336c1a543','eb48a698-2936-44ea-9a19-1d1ec275b742',NULL,'2025-11-30 16:25:07',NULL,'pending',NULL,NULL,0,NULL,NULL,0,'2025-12-01 01:24:07','2025-12-01 01:24:07'),('b6c94c4b-0664-480a-900d-f31cd6611637','96af3507-1b9c-43f2-8319-da93e571ec5b',NULL,'2025-12-01 01:41:17',NULL,'pending',NULL,NULL,0,NULL,NULL,0,'2025-12-01 01:41:14','2025-12-01 01:41:17'),('f2195388-f009-4e48-a629-55c9ec29d45a','6b59c103-5cc0-4317-8ebe-f986d5c81e78',NULL,'2025-11-30 16:25:12',NULL,'pending',NULL,NULL,0,NULL,NULL,0,'2025-12-01 01:24:12','2025-12-01 01:24:12');
/*!40000 ALTER TABLE `task_schedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `title_pool`
--

DROP TABLE IF EXISTS `title_pool`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `title_pool` (
  `title_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int DEFAULT '0',
  `ai_model` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `used` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`title_id`),
  KEY `idx_title_pool_category` (`category`),
  KEY `idx_title_pool_used` (`used`),
  KEY `idx_title_pool_score` (`score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `title_pool`
--

LOCK TABLES `title_pool` WRITE;
/*!40000 ALTER TABLE `title_pool` DISABLE KEYS */;
INSERT INTO `title_pool` VALUES ('title_1764508062113_tldc1bv','충격! 30년간 숨겨온 비밀이 손자, 패닉에 빠졌다','시니어사연',97,'pattern-sampling',1,'2025-11-30 22:07:42'),('title_1764508062120_kl0f07h','\"나 홀로된 어머니이야\" 결혼 10년 만에 나타난 그 사람, 드러난 진실','시니어사연',96,'pattern-sampling',1,'2025-11-30 22:07:42'),('title_1764508062126_n5rnpyy','유산을 노리던 자녀들이 40년간 빚을 다 갚았다, 숨겨진 비밀','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:07:42'),('title_1764508062131_gegzczy','외동딸이 10년 후 빚더미에 앉았다, 충격적인 진실','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:07:42'),('title_1764508062137_r5x0v2f','돈 한 푼 안 주던 도시로 간 자녀들, 10년 후 찾아와 용서를 빌었다','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:07:42'),('title_1764509767972_fxu728r','가난했던 시어머니 vs 부자였던 자식들, 5년 후 역전된 충격적인 진실','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:07'),('title_1764509767979_3jbzw92','평생 헌신한 아내를 버렸던, 30년 만에 대성통곡했다','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:07'),('title_1764509767985_nlivc3a','유산을 노리던 자녀들을 퇴사 압박한, 30년 만에 절규했다','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:07'),('title_1764509767990_5t5uggg','소문 퍼뜨린 유산을 노리던 자녀들, 40년간 찾아와 대성통곡했다','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:07'),('title_1764509767995_vfx886l','결혼 10년 만에 첫째 아들이 로또에 당첨됐다, 충격의 반전','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:07'),('title_1764509768000_myeeu8n','도시로 간 자녀들이 10년간 재산을 물려받았다, 숨겨진 비밀','시니어사연',93,'pattern-sampling',0,'2025-11-30 22:36:08'),('title_1764509768005_0e91xi3','\"용서해줘\" 레스토랑에서 무릎 꿇은 경로당 어르신, 드러난 진실','시니어사연',91,'pattern-sampling',0,'2025-11-30 22:36:08'),('title_1764509768009_285gp2b','\"용서해줘\" 호텔에서 무릎 꿇은 연락 끊긴 딸, 드러난 진실','시니어사연',91,'pattern-sampling',0,'2025-11-30 22:36:08'),('title_1764509809629_60qh9u2','20년 만에 첫째 아들이 보낸 편지, 드러난 진실','북한탈북자사연',96,'pattern-sampling',1,'2025-11-30 22:36:49'),('title_1764509809638_43gymlj','\"나 효자이야\" 30년 만에 나타난 그 사람, 충격의 반전','북한탈북자사연',93,'pattern-sampling',0,'2025-11-30 22:36:49'),('title_1764509809643_snbwit2','모두가 버린 가출했던 아들, 20년 만에 후회의 눈물을 흘렸다','북한탈북자사연',93,'pattern-sampling',1,'2025-11-30 22:36:49'),('title_1764509809648_hc9bfkp','가난했던 부모 버린 자식 vs 부자였던 자식들, 15년 만에 역전된 충격의 반전','북한탈북자사연',93,'pattern-sampling',1,'2025-11-30 22:36:49'),('title_1764509809654_yhwse2c','큰며느리를 버렸던, 40년간 용서를 빌었다','북한탈북자사연',90,'pattern-sampling',0,'2025-11-30 22:36:49'),('title_1764517168384_qizsp7e','결혼 10년 만에 재혼한 아버지가 재벌 후계자로 돌아왔다, 대반전','시니어사연',100,'pattern-sampling',1,'2025-12-01 00:39:28'),('title_1764517168394_50febvb','10년간 연락 끊긴 딸이 본사 부장으로 돌아왔다, 경악스러운 사실','시니어사연',96,'pattern-sampling',1,'2025-12-01 00:39:28'),('title_1764517168400_0qy946q','1년 후 노인정 할머니들이 본사 부장으로 돌아왔다, 대반전','시니어사연',96,'pattern-sampling',1,'2025-12-01 00:39:28'),('title_1764517168405_hfyeddh','유산을 노리던 자녀들과 인연을 끊었다, 결혼 10년 만에 무릎 꿇은 이유','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168412_05yi7c4','유산을 노리던 자녀들과 떠났다, 10년 후 충격적인 고백','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168417_a6xcdz2','효도하던 딸이 1년 후 재산을 물려받았다, 경악할 사실','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168424_kyi998n','장례식장 가족들이 5년 후 보험금을 받았다, 충격의 반전','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168430_af0rhwo','멸시했던 평생 헌신한 아내, 40년간 찾아와 펑펑 울어버렸다','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168436_fu44hmq','노예처럼 다루던 자식들, 5년 후 손자 앞에서 펑펑 울어버렸다','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28'),('title_1764517168442_f1brc2l','차별했던 노모, 1년 후 찾아와 펑펑 울어버렸다','시니어사연',93,'pattern-sampling',0,'2025-12-01 00:39:28');
/*!40000 ALTER TABLE `title_pool` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_admin` tinyint DEFAULT '0',
  `credits` int DEFAULT '0',
  `is_email_verified` tinyint DEFAULT '0',
  `verification_token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `memo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `google_sites_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `google_sites_edit_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `google_sites_home_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_user_email` (`email`),
  KEY `idx_user_verification_token` (`verification_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES ('b5d1f064-60b9-45ab-9bcd-d36948196459','b5d1f064-60b9-45ab-9bcd-d36948196459@placeholder.local','','올드문',0,0,0,NULL,NULL,NULL,'https://sites.google.com/d/1wdaBjcpjaM0WhdQOhG-ATzJ_Dx83ytH_/p/10Ms4qn7y-fscezanBmegRpWuro_iYjoX/edit','https://sites.google.com/view/coupnagbigsale/%ED%99%88','2025-11-30 15:17:12','2025-12-01 00:50:46');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_activity_log`
--

DROP TABLE IF EXISTS `user_activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_activity_log` (
  `activity_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`activity_id`),
  KEY `idx_user_activity_log_user_id` (`user_id`),
  KEY `idx_user_activity_log_created_at` (`created_at`),
  CONSTRAINT `user_activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_activity_log`
--

LOCK TABLES `user_activity_log` WRITE;
/*!40000 ALTER TABLE `user_activity_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_activity_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_charge_request`
--

DROP TABLE IF EXISTS `user_charge_request`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_charge_request` (
  `request_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int NOT NULL,
  `status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_user_charge_request_user_id` (`user_id`),
  KEY `idx_user_charge_request_status` (`status`),
  CONSTRAINT `user_charge_request_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_charge_request`
--

LOCK TABLES `user_charge_request` WRITE;
/*!40000 ALTER TABLE `user_charge_request` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_charge_request` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_content_category`
--

DROP TABLE IF EXISTS `user_content_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_content_category` (
  `id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_content_category_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_content_category`
--

LOCK TABLES `user_content_category` WRITE;
/*!40000 ALTER TABLE `user_content_category` DISABLE KEYS */;
INSERT INTO `user_content_category` VALUES ('cat_1764483432313_5kb99n1','b5d1f064-60b9-45ab-9bcd-d36948196459','시니어사연','시니어 사연 영상','2025-11-30 15:17:12'),('cat_1764483432313_j7a1evt','b5d1f064-60b9-45ab-9bcd-d36948196459','일반','일반 영상','2025-11-30 15:17:12'),('cat_1764483432313_j8enium','b5d1f064-60b9-45ab-9bcd-d36948196459','복수극','복수 이야기','2025-11-30 15:17:12'),('cat_1764483432313_qbsag8t','b5d1f064-60b9-45ab-9bcd-d36948196459','상품','상품 관련 영상','2025-11-30 15:17:12'),('cat_1764483432313_s2xb844','b5d1f064-60b9-45ab-9bcd-d36948196459','막장드라마','막장 드라마','2025-11-30 15:17:12'),('cat_1764483432313_xedahq7','b5d1f064-60b9-45ab-9bcd-d36948196459','북한탈북자사연','북한 탈북자 사연','2025-11-30 15:17:12');
/*!40000 ALTER TABLE `user_content_category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_credit_history`
--

DROP TABLE IF EXISTS `user_credit_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_credit_history` (
  `history_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int NOT NULL,
  `type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `balance_after` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_user_credit_history_user_id` (`user_id`),
  KEY `idx_user_credit_history_created_at` (`created_at`),
  CONSTRAINT `user_credit_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_credit_history`
--

LOCK TABLES `user_credit_history` WRITE;
/*!40000 ALTER TABLE `user_credit_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_credit_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_session`
--

DROP TABLE IF EXISTS `user_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_session` (
  `session_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  KEY `idx_user_session_user_id` (`user_id`),
  KEY `idx_user_session_expires_at` (`expires_at`),
  CONSTRAINT `user_session_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_session`
--

LOCK TABLES `user_session` WRITE;
/*!40000 ALTER TABLE `user_session` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `youtube_channel_setting`
--

DROP TABLE IF EXISTS `youtube_channel_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `youtube_channel_setting` (
  `setting_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thumbnail_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `subscriber_count` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `token_file` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_mode` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'fixed_interval',
  `interval_value` int DEFAULT NULL,
  `interval_unit` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_times` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `weekday_times` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint DEFAULT '1',
  `categories` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_default` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `default_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '11:00',
  PRIMARY KEY (`setting_id`),
  UNIQUE KEY `unique_user_channel` (`user_id`,`channel_id`),
  KEY `idx_youtube_channel_setting_user_id` (`user_id`),
  KEY `idx_youtube_channel_setting_channel_id` (`channel_id`),
  CONSTRAINT `youtube_channel_setting_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `youtube_channel_setting`
--

LOCK TABLES `youtube_channel_setting` WRITE;
/*!40000 ALTER TABLE `youtube_channel_setting` DISABLE KEYS */;
INSERT INTO `youtube_channel_setting` VALUES ('channel_settings_1763057492991_e9yzlzyuu','b5d1f064-60b9-45ab-9bcd-d36948196459','UCNh_t25SLZYmL0uCjI_gk5w','은빛라디오',NULL,NULL,NULL,NULL,NULL,'#ef4444','fixed_interval',1,'days','[\"15:00\"]','[]',1,'[\"시니어사연\",\"막장드라마\",\"감동실화\"]',0,'2025-11-13 18:11:32','2025-11-28 05:18:17','15:00'),('channel_settings_1763057503911_i8039xbq7','b5d1f064-60b9-45ab-9bcd-d36948196459','UCZ-DUBUAV53zBuiK-3bYfEg','쇼츠왕',NULL,NULL,NULL,NULL,NULL,'#06b6d4','fixed_interval',3,'days',NULL,'[]',1,'[]',0,'2025-11-13 18:11:43','2025-11-13 18:11:43','11:00'),('channel_settings_1763057517418_czu2e45ia','b5d1f064-60b9-45ab-9bcd-d36948196459','UCCP9WVj65HZWREdG9yHQN-g','상사맨',NULL,NULL,NULL,NULL,NULL,'#f97316','fixed_interval',1,'days','[\"15:30\"]','[]',1,'[\"상품\"]',0,'2025-11-13 18:11:57','2025-11-28 05:19:58','15:30'),('channel_settings_1763057525928_kr1yg9l70','b5d1f064-60b9-45ab-9bcd-d36948196459','UC_pW5DOf3GFn-5dYQMxGYpA','6090놀이터',NULL,NULL,NULL,NULL,NULL,'#3b82f6','fixed_interval',1,'days','[\"15:00\"]','[]',1,'[\"시니어사연\",\"막장드라마\",\"감동실화\"]',0,'2025-11-13 18:12:05','2025-11-28 05:17:49','15:00'),('channel_settings_1763057532257_f4tib1nw2','b5d1f064-60b9-45ab-9bcd-d36948196459','UCaqTVU1mzzvYfha4DbFjcSA','원사사',NULL,NULL,NULL,NULL,NULL,'#ec4899','fixed_interval',3,'days',NULL,'[]',1,'[]',0,'2025-11-13 18:12:12','2025-11-13 18:12:12','11:00'),('channel_settings_1763057537647_r4j3gsx8b','b5d1f064-60b9-45ab-9bcd-d36948196459','UCHzVmjofL7WZfcWgvSqe-UQ','bossman',NULL,NULL,NULL,NULL,NULL,'#10b981','fixed_interval',1,'days','[\"09:00\",\"15:00\",\"21:00\"]','[]',1,'[\"상품\"]',0,'2025-11-13 18:12:17','2025-11-28 05:18:48','09:00'),('channel_settings_1764307162566_u1gpqxe17','b5d1f064-60b9-45ab-9bcd-d36948196459','UCSJXGGdhQ8kQlG4zsYCBCdQ','6090사연',NULL,NULL,NULL,NULL,NULL,'#f59e0b','fixed_interval',1,'days','[\"16:00\"]','{\"1\":[\"09:00\",\"15:00\",\"21:00\"],\"3\":[\"09:00\",\"15:00\",\"21:00\"],\"5\":[\"09:00\",\"15:00\",\"21:00\"]}',1,'[\"북한탈북자사연\"]',0,'2025-11-28 05:19:22','2025-11-28 05:19:22','16:00'),('channel_settings_1764393191309_8ugtsbj1u','b5d1f064-60b9-45ab-9bcd-d36948196459','UCl5LpL2OxuiNRQDniWKNVwg','6090놀이터',NULL,NULL,NULL,NULL,NULL,'#10b981','fixed_interval',1,'days','[\"09:00\",\"15:00\",\"21:00\"]','{\"1\":[\"09:00\",\"15:00\",\"21:00\"],\"3\":[\"09:00\",\"15:00\",\"21:00\"],\"5\":[\"09:00\",\"15:00\",\"21:00\"]}',1,'[]',0,'2025-11-29 05:13:11','2025-11-29 05:13:11','11:00');
/*!40000 ALTER TABLE `youtube_channel_setting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `youtube_uploads`
--

DROP TABLE IF EXISTS `youtube_uploads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `youtube_uploads` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `task_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `youtube_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `youtube_video_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_youtube_uploads_content` (`content_id`),
  KEY `idx_youtube_uploads_task` (`task_id`),
  KEY `idx_youtube_uploads_channel` (`channel_id`),
  KEY `idx_youtube_uploads_video_id` (`youtube_video_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `youtube_uploads`
--

LOCK TABLES `youtube_uploads` WRITE;
/*!40000 ALTER TABLE `youtube_uploads` DISABLE KEYS */;
INSERT INTO `youtube_uploads` VALUES ('2d87aa3e-5bbc-4d55-86f1-3b34e282e77a',NULL,'397612bc-60f8-4fc5-90a5-4385b7f790d9','461054cb-a678-4f0c-bda7-ca6ec73309c6','https://youtu.be/qqjvczAwhIg','qqjvczAwhIg','active','2025-11-27 16:35:03','2025-11-27 16:35:03'),('429b6821-eecd-4a29-a697-d5cdd480ccdd','ebff49ba-cd93-4933-96a4-5fb5efc748ab',NULL,NULL,'https://youtu.be/UITBwrAirMw','UITBwrAirMw','active','2025-11-27 03:34:14','2025-11-27 03:34:14'),('6c1d63a1-6e78-4a38-8578-c45d228f2474','f71fbbe3-6776-491e-8144-9c1ecd6b03ca',NULL,NULL,'https://youtu.be/m16YZc4uHLk','m16YZc4uHLk','active','2025-11-27 04:00:59','2025-11-27 04:00:59'),('6feeb2ee-8260-4fd1-a81e-22736ae15964','c425e883-c7c0-46e7-af91-c41ec9ee62d7',NULL,NULL,'https://youtu.be/YrkSYnID9aU','YrkSYnID9aU','active','2025-11-27 03:00:03','2025-11-27 03:00:03'),('8932ca50-1d00-49cf-a8ce-b523548294fb','33e7f2dc-6568-4126-824a-3246191f5932',NULL,NULL,'https://youtu.be/yQOni9Zw-WE','yQOni9Zw-WE','active','2025-11-27 06:59:47','2025-11-27 06:59:47'),('b84aaccb-a8c3-4ea0-8d54-7a96a51d1d2d','77a314ea-9059-41ad-8b90-21d1f2465041',NULL,NULL,'https://youtu.be/Y_NrHRkkFJ0','Y_NrHRkkFJ0','active','2025-11-27 03:23:54','2025-11-27 03:23:54');
/*!40000 ALTER TABLE `youtube_uploads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'trend_video'
--

--
-- Dumping routines for database 'trend_video'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-01  4:59:38
