INSERT INTO projects (id, brand_id, parent_id, name, drive_path, date_start, date_end, status, settled) VALUES
(1, 2, NULL, 'Website Redesign', '202601 Website Redesign', '2026-01-15', '2026-03-15', '진행중', false),
(2, 2, 1, 'Homepage', '202601 Homepage', '2026-01-15', '2026-02-15', '진행중', false),
(3, 2, 1, 'About Page', '202601 About Page', '2026-02-01', '2026-02-28', '진행중', false),
(4, 2, NULL, 'Mobile App v2', '202602 Mobile App', '2026-02-01', '2026-04-30', '진행중', false),
(5, 2, 4, 'UI Design', '202602 UI Design', '2026-02-01', '2026-03-15', '진행중', false),
(6, 2, 4, 'Icon Set', '202602 Icons', '2026-02-15', '2026-03-01', '완료', false),
(7, 3, NULL, 'Brand Identity', '202601 Brand Identity', '2026-01-20', '2026-03-20', '진행중', false),
(8, 3, 7, 'Logo Design', '202601 Logo', '2026-01-20', '2026-02-20', '완료', false),
(9, 3, 7, 'Brand Guidelines', '202601 Guidelines', '2026-02-15', '2026-03-20', '진행중', false),
(10, 4, NULL, 'Social Campaign', '202602 Social', '2026-02-10', '2026-03-31', '진행중', false),
(11, 4, 10, 'Instagram Creatives', '202602 IG Creatives', '2026-02-10', '2026-03-10', '진행중', false),
(12, 4, 10, 'YouTube Thumbnails', '202602 YT Thumbnails', '2026-02-20', '2026-03-20', '진행전', false),
(13, 5, NULL, 'Product Launch', '202603 Product Launch', '2026-03-01', '2026-04-15', '진행전', false),
(14, 5, 13, 'Landing Page', '202603 Landing', '2026-03-01', '2026-03-31', '진행전', false),
(15, 5, 13, 'Email Templates', '202603 Email', '2026-03-15', '2026-04-15', '진행전', false),
(16, 1, NULL, 'Internal Portal', '202601 Portal', '2026-01-10', '2026-02-28', '완료', true),
(17, 1, NULL, 'Annual Report', '202602 Annual Report', '2026-02-01', '2026-03-15', '보류', false),
(18, 2, NULL, 'Package Design', '202603 Package', '2026-03-10', '2026-04-20', '진행전', false),
(19, 3, NULL, 'Office Signage', '202603 Signage', '2026-03-05', '2026-04-10', '진행중', false),
(20, 1, NULL, 'ACME 전체', NULL, NULL, NULL, '진행중', false);

-- brand_id 매핑: ACME=1, BLUE=2, GREEN=3, SUNSET=4, NOVA=5
-- brands 테이블의 순서에 맞춰 매핑

SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));
