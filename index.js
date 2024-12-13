// Import necessary modules
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const { readFile } = require('fs/promises');
// Import necessary modules
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize the app
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// MongoDB connection
mongoose.connect('mongodb://mongodb:27017/parts', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  user: 'admin',
  pass: 'password',
  authSource: 'admin' // specify the database for authentication
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Define the schema and model
const partSchema = new mongoose.Schema({
  "LCSC Part Number": String,
  "Manufacture Part Number": String,
  "Manufacturer": String,
  "Customer NO.": String,
  "Package": String,
  "Description": String,
  "Order Qty.": String
});

const Part = mongoose.model('parts', partSchema);

// Create an index on text fields for text search
Part.collection.createIndex({
  "LCSC Part Number": "text",
  "Manufacture Part Number": "text",
  "Manufacturer": "text",
  "Description": "text",
});


// Routes
app.get('/', async (req, res) => {
  const html = await readFile(path.join(__dirname, 'views', 'index.ejs'), 'utf-8');
  res.send(html);
});

// Route to upload and process BOM CSV
app.post('/upload-bom', upload.single('bomFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const missingComponents = [];
  const processedComponents = [];
  const tasks = []; // Array to store promises for database operations

  // Parse the uploaded CSV
  fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (row) => {
      let { 'LCSC Part #': partNumber, 'Footprint': footprints, 'Value': value, 'Quantity': quality } = row;

      // Ensure footprints and value are strings and trim leading zeros from footprints
      footprints = typeof footprints === 'string' ? footprints : '';
      value = typeof value === 'string' ? value : '';

      // Create a promise for each database lookup
      const task = Part.findOne({
        $or: [
          { 'LCSC Part Number': partNumber },
          {
            $and: [
              { Description: { $regex: value, $options: 'i' } },
              { Package: { $regex: footprints, $options: 'i' } }
            ]
          }
        ]
      })
        .then((part) => {
          if (part) {
            processedComponents.push(part);
          } else {
            missingComponents.push({ partNumber, footprints, value, quality });
          }
        })
        .catch((err) => console.error('Error processing row:', err));

      tasks.push(task);
    })
    .on('end', async () => {
      try {
        // Wait for all tasks to complete
        await Promise.all(tasks);

        // Delete the temporary file
        fs.unlinkSync(req.file.path);

        // Respond with the results
        res.json({
          processedComponents,
          missingComponents,
        });
      } catch (err) {
        console.error('Error waiting for tasks:', err);
        res.status(500).json({ error: 'Error processing file' });
      }
    });
});

app.post('/search', async (req, res) => {
  const searchTerms = req.body.searchTerms;
  try {
    // Create regex for each search term
    const regexes = searchTerms.map(term => new RegExp(term, 'i'));  // Case-insensitive regex

    // Search for each term across all fields using $and
    const results = await Part.find({
      $and: regexes.map(regex => ({
        $or: [
          { 'LCSC Part Number': { $regex: regex } },
          { 'Manufacture Part Number': { $regex: regex } },
          { Manufacturer: { $regex: regex } },
          { 'Customer NO.': { $regex: regex } },
          { Package: { $regex: regex } },
          { Description: { $regex: regex } },
          { 'Order Qty.': { $regex: regex } }
        ]
      }))
    });

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error occurred while searching.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
