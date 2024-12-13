// Import necessary modules
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const { readFile } = require('fs/promises');

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

// Routes
app.get('/', async (req, res) => {
  const html = await readFile(path.join(__dirname, 'views', 'index.ejs'), 'utf-8');
  res.send(html);
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

// Create an index on text fields for text search
Part.collection.createIndex({
  "LCSC Part Number": "text",
  "Manufacture Part Number": "text",
  "Manufacturer": "text",
  "Description": "text",
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
