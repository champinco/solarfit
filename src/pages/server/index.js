const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000; // Use the port from .env or default to 5000

// Enable CORS
app.use(cors());

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Store uploaded files in the 'uploads' directory
  },
  filename: (req, file, cb) => {
    // Rename the file to avoid conflicts (you might want to generate unique names)
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage: storage });

// API endpoint for file upload
app.post('/api/upload', upload.single('bill'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // File upload was successful
  console.log('File uploaded successfully:', req.file);

  // Here, you would typically:
  // 1. Process the uploaded file (e.g., using OCR)
  // 2. Extract the data from the bill
  // 3. Store the data in the database
  // 4. Return the extracted data to the frontend

  // For now, just return the file information
  res.status(200).json({
    message: 'File uploaded successfully',
    file: req.file,
  });
});

app.get('/', (req, res) => {
  res.send('Backend server is running!');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});