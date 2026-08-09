const fs = require('fs');
const multer = require('multer');
const path = require('path');

const uploadDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + (ALLOWED_EXT.has(ext) ? ext : ''));
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 12,
  },
});

const uploadProductFields = upload.fields([
  { name: 'product_image', maxCount: 1 },
  { name: 'gallery_images', maxCount: 10 },
]);

const uploadSingle = upload.single('product_image');
const uploadMultiple = upload.array('gallery_images', 10);

module.exports = { uploadProductFields, uploadSingle, uploadMultiple };
