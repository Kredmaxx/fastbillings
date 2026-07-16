const multer = require('multer');
const path = require('path');

// Storage settings remain the same
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/products/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  }
});

// File filter remains the same
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// ✅ The Fix: Use .fields() to handle multiple different file inputs
const uploadProductFields = upload.fields([
  { name: 'product_image', maxCount: 1 },    // for the single product image
  { name: 'gallery_images', maxCount: 10 }  // for the array of gallery images
]);

// Export the single middleware
module.exports = { uploadProductFields };