const { createWorker } = require('tesseract.js'); // For OCR
const express = require('express');             // Web framework
const multer = require('multer');               // For file uploads
const cors = require('cors');                   // For cross-origin requests
const mongoose = require('mongoose');           // For MongoDB interaction
const path = require('path');                   // For handling file paths
const fs = require('fs');                       // For file system operations (like deleting files)
require('dotenv').config();                     // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 5000; // Use the port from .env or default to 5000

// --- Middleware ---
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// --- MongoDB Connection ---
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
    console.error('FATAL ERROR: MONGODB_URI is not defined in .env file.');
    process.exit(1); // Exit the application if DB connection string is missing
}

mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB Connected Successfully.'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        process.exit(1); // Exit if connection fails on startup
    });

// Optional: Listen for runtime errors after initial connection
mongoose.connection.on('error', err => {
    console.error('MongoDB runtime error:', err);
});
// --- End MongoDB Connection ---

// --- Mongoose Schema and Model ---
const billUploadSchema = new mongoose.Schema({
    originalFilename: { type: String, required: true },
    serverFilePath: { type: String, required: true }, // Path where the file was stored on the server
    mimetype: { type: String },
    size: { type: Number },
    extractedText: { type: String },
    consumptionKwh: { type: Number, default: null },
    totalAmount: { type: Number, default: null },
    uploadTimestamp: { type: Date, default: Date.now } // Record when it was uploaded/processed
});

// Mongoose automatically creates the collection name by pluralizing and lowercasing the model name ('BillUpload' -> 'billuploads')
const BillUpload = mongoose.model('BillUpload', billUploadSchema);
// --- End Mongoose Schema and Model ---


// --- File Upload Configuration ---
// Define the path for uploads relative to this script's directory
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure the uploads directory exists synchronously on startup
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log(`Created directory: ${uploadsDir}`);
} else {
    console.log(`Uploads directory already exists: ${uploadsDir}`);
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Store uploaded files in the 'uploads' directory
    },
    filename: (req, file, cb) => {
        // Rename the file to avoid conflicts
        cb(null, Date.now() + '-' + path.parse(file.originalname).name + path.extname(file.originalname)); // Retain original extension
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Optional: Limit file size (e.g., 10MB)
});
// --- End File Upload Configuration ---


// =============================================================
//      API endpoint for file upload, OCR, and DB Save
// =============================================================
app.post('/api/upload', upload.single('bill'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('File received:', req.file);
    const filePath = req.file.path; // Keep track of the file path for cleanup

    let ocrSuccessful = false;
    let extractedText = null;
    let consumptionKwh = null;
    let totalAmount = null;

    try {
        // --- OCR Processing ---
        console.log('Starting OCR processing...');
        const worker = await createWorker('eng'); // Initialize Tesseract worker for English
        const ret = await worker.recognize(filePath);
        extractedText = ret.data.text; // Assign extracted text
        console.log('OCR Result (Raw):', extractedText);
        await worker.terminate(); // Terminate worker to free resources
        console.log('OCR processing finished.');
        ocrSuccessful = true;
        // --- End OCR Processing ---

        // --- Basic Data Extraction ---
        // Only attempt to parse if OCR actually returned some text
        if (extractedText) {
            // Example: Try to find "kWh" preceded/followed by a number
            const kwhMatch = extractedText.match(/(\d[\d,.]*)\s*kwh|kwh\s*(\d[\d,.]*)/i);
            if (kwhMatch) {
                const kwhValue = kwhMatch[1] || kwhMatch[2];
                if (kwhValue) {
                    consumptionKwh = parseFloat(kwhValue.replace(/,/g, '')); // Remove commas
                    console.log('Found Consumption (kWh):', consumptionKwh);
                }
            }

            // Example: Try to find "Total Amount", "Total Due", etc. followed by currency and number
            const amountMatch = extractedText.match(/(Total Amount|Total Due|Amount Payable)[:\s]*?(KES|UGX|TZS|USD|\$)?\s*([\d,]+\.?\d*)/i);
            if (amountMatch && amountMatch[3]) { // Check the number part
                totalAmount = parseFloat(amountMatch[3].replace(/,/g, '')); // Remove commas
                console.log('Found Total Amount:', totalAmount);
            } else {
                // Fallback: Try finding just a currency symbol followed by a number near the end of a line
                const fallbackAmountMatch = extractedText.match(/(KES|UGX|TZS|USD|\$)\s*([\d,]+\.?\d*)\s*$/im);
                if (fallbackAmountMatch && fallbackAmountMatch[2]) {
                    totalAmount = parseFloat(fallbackAmountMatch[2].replace(/,/g, ''));
                    console.log('Found Total Amount (Fallback):', totalAmount);
                }
            }
        } else {
            console.log("OCR did not return text, skipping data extraction.");
        }
        // --- End Basic Data Extraction ---

        // --- Save to Database ---
        console.log('Attempting to save data to MongoDB...');
        const newBill = new BillUpload({
            originalFilename: req.file.originalname,
            serverFilePath: filePath,
            mimetype: req.file.mimetype,
            size: req.file.size,
            extractedText: extractedText,
            consumptionKwh: consumptionKwh,
            totalAmount: totalAmount
            // uploadTimestamp is added by default by Mongoose Schema
        });

        await newBill.save(); // Asynchronously save the document
        console.log('Bill data saved successfully to MongoDB. ID:', newBill._id);
        // --- End Save to Database ---


        // Respond to frontend with success and data
        res.status(200).json({
            message: 'File processed successfully with OCR and saved.',
            dbId: newBill._id, // Send back the ID of the saved document
            originalFilename: req.file.originalname,
            extractedText: extractedText,
            extractedData: {
                consumptionKwh: consumptionKwh,
                totalAmount: totalAmount
            }
        });

    } catch (error) {
        console.error('Error during processing or saving:', error);

        // Customize response based on where the error occurred
        if (!ocrSuccessful) {
            console.error('Error occurred during OCR processing.');
            // Don't include extracted data if OCR failed
            res.status(500).json({ message: 'Error during OCR processing', error: error.message });
        } else {
            console.error('Error occurred during data extraction or DB save.');
            // Try to respond with extracted data even if save failed, as OCR worked
            res.status(500).json({
                message: 'OCR successful, but error during saving or data parsing.',
                error: error.message,
                extractedText: extractedText, // Send text even if save failed
                extractedData: {
                    consumptionKwh: consumptionKwh, // Might be null if parsing failed
                    totalAmount: totalAmount      // Might be null if parsing failed
                }
            });
        }
    } finally {
        // --- Clean up uploaded file ---
        // Use 'finally' to ensure this runs whether the try block succeeded or failed
        fs.unlink(filePath, (err) => {
            if (err) {
                // Log error but don't overwrite the original response
                console.error('Error deleting uploaded file:', filePath, err);
            } else {
                console.log('Successfully deleted uploaded file:', filePath);
            }
        });
        // --- End Clean up ---
    }
});
// =============================================================
//              END of API endpoint
// =============================================================

//  Sizing Calculation API endpoint
app.post('/api/calculate', (req, res) => {
  try {
    // Extract sizing parameters from the request body
    const { location, systemType, roofArea, roofType, avgMonthlyKwh, batterySize } = req.body;

    // Log the received parameters for debugging
    console.log('Received sizing parameters:', req.body);

    // Perform your sizing calculation logic here
    // This is a placeholder - replace with your actual calculations
    const calculationResult = {
      solarPanelSize: roofArea * 0.8, // Example calculation
      batteryCapacity: batterySize || 10, // Example calculation, default to 10 if not provided
      estimatedCost: 5000, // Example
      message: 'Sizing calculation completed successfully!'
    };

    // Send the calculation result back to the client
    res.status(200).json(calculationResult);
  } catch (error) {
    // Handle any errors that occur during the calculation
    console.error('Error during sizing calculation:', error);
    res.status(500).json({ message: 'Error during sizing calculation', error: error.message });
  }
});


// Basic root route for testing if the server is running
app.get('/', (req, res) => {
    res.send('Backend server is running!');
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});