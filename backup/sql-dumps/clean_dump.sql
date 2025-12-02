-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: 192.168.0.30    Database: trend_video
-- ------------------------------------------------------
-- Server version	8.4.6

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
  `pipeline_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_level` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci,
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
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `automation_setting`
--

LOCK TABLES `automation_setting` WRITE;
/*!40000 ALTER TABLE `automation_setting` DISABLE KEYS */;
/*!40000 ALTER TABLE `automation_setting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `content`
--

DROP TABLE IF EXISTS `content`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `content` (
  `content_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `score` int DEFAULT '0',
  `error` text COLLATE utf8mb4_unicode_ci,
  `youtube_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `youtube_channel` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `youtube_publish_time` datetime DEFAULT NULL,
  `input_tokens` int DEFAULT NULL,
  `output_tokens` int DEFAULT NULL,
  `source_content_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prompt_format` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_info` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40000 ALTER TABLE `content` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `content_setting`
--

DROP TABLE IF EXISTS `content_setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `content_setting` (
  `content_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `script_mode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `media_mode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tts_voice` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'ko-KR-SoonBokNeural',
  `tts_speed` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '+0%',
  `auto_create_shortform` tinyint DEFAULT '0',
  `tags` text COLLATE utf8mb4_unicode_ci,
  `settings` text COLLATE utf8mb4_unicode_ci,
  `youtube_privacy` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'private',
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
/*!40000 ALTER TABLE `content_setting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coupang_crawl_queue`
--

DROP TABLE IF EXISTS `coupang_crawl_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupang_crawl_queue` (
  `queue_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_url` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `retry_count` int DEFAULT '0',
  `max_retries` int DEFAULT '3',
  `timeout_seconds` int DEFAULT '60',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `product_info` text COLLATE utf8mb4_unicode_ci,
  `custom_category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `destination` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'my_list',
  `source_url` text COLLATE utf8mb4_unicode_ci,
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
  `coupang_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` text COLLATE utf8mb4_unicode_ci,
  `product_url` text COLLATE utf8mb4_unicode_ci,
  `deep_link` text COLLATE utf8mb4_unicode_ci,
  `original_price` int DEFAULT NULL,
  `discount_price` int DEFAULT NULL,
  `rocket_shipping` tinyint DEFAULT '0',
  `free_shipping` tinyint DEFAULT '0',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `view_count` int DEFAULT '0',
  `click_count` int DEFAULT '0',
  `is_favorite` tinyint DEFAULT '0',
  `queue_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40000 ALTER TABLE `coupang_product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_crawl_link`
--

DROP TABLE IF EXISTS `product_crawl_link`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `product_crawl_link` (
  `link_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
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
  `history_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `hostname` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_result_count` int DEFAULT '0',
  `last_duplicate_count` int DEFAULT '0',
  `last_error_count` int DEFAULT '0',
  `last_total_links` int DEFAULT '0',
  `last_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `last_message` text COLLATE utf8mb4_unicode_ci,
  `last_job_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `pending_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_url` text COLLATE utf8mb4_unicode_ci,
  `original_price` int DEFAULT NULL,
  `discount_price` int DEFAULT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `crawl_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'not_crawled',
  `notes` text COLLATE utf8mb4_unicode_ci,
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
  `task_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','active','completed','archived','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40000 ALTER TABLE `task` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_lock`
--

DROP TABLE IF EXISTS `task_lock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_lock` (
  `task_type` enum('script','image','video','youtube') COLLATE utf8mb4_unicode_ci NOT NULL,
  `locked_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
INSERT INTO `task_lock` VALUES ('script',NULL,NULL,NULL),('image',NULL,NULL,NULL),('video',NULL,NULL,NULL),('youtube',NULL,NULL,NULL);
/*!40000 ALTER TABLE `task_lock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_queue`
--

DROP TABLE IF EXISTS `task_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_queue` (
  `task_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('schedule','script','image','video','youtube') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('waiting','processing','completed','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `error` text COLLATE utf8mb4_unicode_ci,
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
/*!40000 ALTER TABLE `task_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_schedule`
--

DROP TABLE IF EXISTS `task_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_schedule` (
  `schedule_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_time` datetime NOT NULL,
  `youtube_publish_time` datetime DEFAULT NULL,
  `status` enum('pending','processing','completed','failed','cancelled','waiting_for_upload') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `failed_stage` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `retry_count` int DEFAULT '0',
  `shortform_task_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parent_youtube_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40000 ALTER TABLE `task_schedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `title_pool`
--

DROP TABLE IF EXISTS `title_pool`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `title_pool` (
  `title_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int DEFAULT '0',
  `ai_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
/*!40000 ALTER TABLE `title_pool` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_admin` tinyint DEFAULT '0',
  `credits` int DEFAULT '0',
  `is_email_verified` tinyint DEFAULT '0',
  `verification_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `memo` text COLLATE utf8mb4_unicode_ci,
  `google_sites_url` text COLLATE utf8mb4_unicode_ci,
  `google_sites_edit_url` text COLLATE utf8mb4_unicode_ci,
  `google_sites_home_url` text COLLATE utf8mb4_unicode_ci,
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
INSERT INTO `user` VALUES ('b5d1f064-60b9-45ab-9bcd-d36948196459','b5d1f064-60b9-45ab-9bcd-d36948196459@placeholder.local','','',0,0,0,NULL,NULL,NULL,NULL,NULL,'2025-11-30 15:17:12','2025-11-30 15:17:12');
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
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` text COLLATE utf8mb4_unicode_ci,
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
  `request_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
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
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
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
INSERT INTO `user_content_category` VALUES ('cat_1764483432313_5kb99n1','b5d1f064-60b9-45ab-9bcd-d36948196459','?úÎãà?¥ÏÇ¨??,'?úÎãà???¨Ïó∞ ?ÅÏÉÅ','2025-11-30 15:17:12'),('cat_1764483432313_7gxwaob','b5d1f064-60b9-45ab-9bcd-d36948196459','Î°úÎß®??,'Î°úÎß®???¥ÏïºÍ∏?,'2025-11-30 15:17:12'),('cat_1764483432313_dende6d','b5d1f064-60b9-45ab-9bcd-d36948196459','Í∞êÎèô?§Ìôî','Í∞êÎèô ?§Ìôî','2025-11-30 15:17:12'),('cat_1764483432313_j7a1evt','b5d1f064-60b9-45ab-9bcd-d36948196459','?ºÎ∞ò','?ºÎ∞ò ?ÅÏÉÅ','2025-11-30 15:17:12'),('cat_1764483432313_j8enium','b5d1f064-60b9-45ab-9bcd-d36948196459','Î≥µÏàòÍ∑?,'Î≥µÏàò ?¥ÏïºÍ∏?,'2025-11-30 15:17:12'),('cat_1764483432313_kpcxd3k','b5d1f064-60b9-45ab-9bcd-d36948196459','ÏΩîÎ???,'ÏΩîÎ????ÅÏÉÅ','2025-11-30 15:17:12'),('cat_1764483432313_qbsag8t','b5d1f064-60b9-45ab-9bcd-d36948196459','?ÅÌíà','?ÅÌíà Í¥Ä???ÅÏÉÅ','2025-11-30 15:17:12'),('cat_1764483432313_s2xb844','b5d1f064-60b9-45ab-9bcd-d36948196459','ÎßâÏû•?úÎùºÎß?,'ÎßâÏû• ?úÎùºÎß?,'2025-11-30 15:17:12'),('cat_1764483432313_wkjk0da','b5d1f064-60b9-45ab-9bcd-d36948196459','?§Î¶¥??,'?§Î¶¥???¥ÏïºÍ∏?,'2025-11-30 15:17:12'),('cat_1764483432313_xedahq7','b5d1f064-60b9-45ab-9bcd-d36948196459','Î∂ÅÌïú?àÎ∂Å?êÏÇ¨??,'Î∂ÅÌïú ?àÎ∂Å???¨Ïó∞','2025-11-30 15:17:12');
/*!40000 ALTER TABLE `user_content_category` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_credit_history`
--

DROP TABLE IF EXISTS `user_credit_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_credit_history` (
  `history_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
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
  `session_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
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
  `setting_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `thumbnail_url` text COLLATE utf8mb4_unicode_ci,
  `subscriber_count` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `token_file` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_mode` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fixed_interval',
  `interval_value` int DEFAULT NULL,
  `interval_unit` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `posting_times` text COLLATE utf8mb4_unicode_ci,
  `weekday_times` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint DEFAULT '1',
  `categories` text COLLATE utf8mb4_unicode_ci,
  `is_default` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
/*!40000 ALTER TABLE `youtube_channel_setting` ENABLE KEYS */;
UNLOCK TABLES;

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

-- Dump completed on 2025-11-30 21:29:59
