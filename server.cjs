"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const postgres_1 = require("@vercel/postgres");
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer")); // Import multer for handling file uploads
const bodyParser = require('body-parser');
const streamifier = require('streamifier'); // Import the 'streamifier' package
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const format = require('pg-format');
// Import the 'mime-types' library
const mimeTypes = require('mime-types');
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
// Increase the request size limit (e.g., 50MB)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// Configure multer to handle file uploads
const storage = multer_1.default.memoryStorage(); // Store file data in memory
const upload = (0, multer_1.default)({ storage: storage });

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Connect to the database
    const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
    });
    await client.connect();

    // Sanitize the email for safe string interpolation
    const sanitizedEmail = format('%s', email);  
    // Retrieve user from the database
    // Assuming sanitizedEmail is the sanitized value of the email
    const loginQuery = format('SELECT * FROM users WHERE email = %L', sanitizedEmail);
    console.log('loginQuery:', loginQuery);
    const result = await client.query(loginQuery);
    const user = result.rows[0];
    
    // Check if the user exists and the password is correct
    if (user && await bcrypt.compare(password, user.password)) {
      // Generate a JWT token
      const token = jwt.sign({ userId: user.id }, 'k01', { expiresIn: '1h' });
        console.log('token: ', token)
      // Send the token to the client
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }

    // Disconnect from the database
    await client.end();
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/riskItems', upload.single('planFiles'), async (req, res) => {
    const newRisk = JSON.parse(req.body.json_data || '{}');
    const planFiles = req.file ? req.file.buffer : null; // Get the uploaded file data
    const planFilesName = req.file ? req.file.originalname : '';
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const insertQuery = `
          INSERT INTO risk_items (title, description, planDescription, planFiles, planFilesName, planapproval, likelihood, impact, date, responsibleChecklist, responsiblePlan, completed)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `;

        const values = [
            newRisk.title || '',
            newRisk.description || '',
            newRisk.planDescription || '',
            planFiles,
            planFilesName,
            newRisk.planapproval || '',
            newRisk.likelihood || '',
            newRisk.impact || '',
            newRisk.date || '',
            newRisk.responsibleChecklist || '',
            newRisk.responsiblePlan || '',
            newRisk.completed ? 1 : 0,
        ];
        const result = await client.query(insertQuery, values);

        const id = result.rows[0].id;
        // Release the client
        await client.end();
        const createdRisk = {
            id,
            title: newRisk.title,
            description: newRisk.description,
            planDescription: newRisk.planDescription,
            planFiles: planFiles,
            planFilesName: planFilesName,
            planapproval: newRisk.planapproval,
            likelihood: newRisk.likelihood,
            impact: newRisk.impact,
            date: newRisk.date,
            responsibleChecklist: newRisk.responsibleChecklist,
            responsiblePlan: newRisk.responsiblePlan,
            completed: newRisk.completed,
        };
        res.status(201).json(createdRisk);
    }
    catch (error) {
        console.error('Error adding risk item to the database:', error);
        return res.status(500).json({ error: 'Failed to add risk item to database' });
    }
});

// New endpoint to fetch all risk items
app.get('/api/riskItems', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 5; // Default to 10 items per page
    const offset = (page - 1) * itemsPerPage;
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const fetchQuery = `
      SELECT id, title, description, planDescription, planFiles, likelihood, impact, date, responsibleChecklist, responsiblePlan, completed
      FROM risk_items
      LIMIT $1 OFFSET $2
    `;
        const result = await client.query(fetchQuery, [itemsPerPage, offset]);
        // Release the client
        await client.end();
        const riskItems = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
            planDescription: row.planDescription,
            planFiles: row.planFiles,
            likelihood: row.likelihood,
            impact: row.impact,
            date: row.date,
            responsibleChecklist: row.responsibleChecklist,
            responsiblePlan: row.responsiblePlan,
            completed: row.completed,
        }));
        res.json(riskItems);
    }
    catch (error) {
        console.error('Error fetching risk items:', error);
        return res.status(500).json({ error: 'Failed to fetch risk items from the database' });
    }
});

app.get('/api/lastRiskItems', async (req, res) => {
    const numberOfLastItems = 5; // Adjust as needed
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const fetchQuery = `
          SELECT id, title, description
          FROM risk_items
          ORDER BY id DESC
        `;
        const result = await client.query(fetchQuery);
        // Release the client
        await client.end();
        const lastRiskItems = result.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description,
        }));
        res.json(lastRiskItems);
    }
    catch (error) {
        console.error('Error fetching last risk items:', error);
        return res.status(500).json({ error: 'Failed to fetch last risk items from the database' });
    }
});

app.put('/api/riskItems/:id', async (req, res) => {
    const id = req.params.id;
    const updateField = req.body; // This should be an object containing the field to update and its new value
    if (!id || !updateField) {
        return res.status(400).json({ error: 'Invalid request data' });
    }
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const updateQuery = `
          UPDATE risk_items
          SET ${Object.keys(updateField)[0]} = '${updateField[Object.keys(updateField)[0]]}'
          WHERE id = ${id}
        `;

        await client.query(updateQuery);
        // Release the client
        await client.end();
        res.status(200).json({ message: 'Risk item updated successfully' });
    }
    catch (error) {
        console.error('Error updating risk item:', error);
        return res.status(500).json({ error: 'Failed to update risk item in the database' });
    }
});

app.get('/api/appliedChecklists', async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 5; // Default to 5 items per page
    const offset = (page - 1) * itemsPerPage;
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const fetchQuery = `
          SELECT id, title
          FROM applied_checklists
          LIMIT ${itemsPerPage} OFFSET ${offset}
        `;
        
        const { rows } = await client.query(fetchQuery);
        // Release the client
        await client.end();
        const appliedChecklists = rows.map(row => ({
            id: row.id,
            title: row.title
        }));
        res.json(appliedChecklists);
    }
    catch (error) {
        console.error('Error fetching applied checklists:', error);
        return res.status(500).json({ error: 'Failed to fetch applied checklists from the database' });
    }
});

app.post('/api/appliedChecklists', async (req, res) => {
    const newAppliedChecklist = req.body;
    if (!newAppliedChecklist) {
        return res.status(400).json({ error: 'Invalid request data' });
    }
    const { title, dateApplied } = newAppliedChecklist;
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const insertQuery = `
      INSERT INTO applied_checklists (title, dateApplied)
      VALUES ($1, $2)
      RETURNING id
    `;
        const { rows } = await client.query(insertQuery, [title || '', dateApplied || '']);
        // Release the client
        await client.end();
        const createdAppliedChecklist = {
            id: rows[0].id,
            title,
            dateApplied,
        };
        res.status(201).json(createdAppliedChecklist);
    }
    catch (error) {
        console.error('Error adding applied checklist to the database:', error);
        return res.status(500).json({ error: 'Failed to add applied checklist to the database' });
    }
});

app.get('/api/chartData', async (req, res) => {
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const fetchQuery = `
          SELECT planApproval
          FROM risk_items
        `;
        const { rows } = await client.query(fetchQuery); // Release the client 

        await client.end(); 
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching chart data:', error);
        return res.status(500).json({ error: 'Failed to fetch chart data from the database' });
    }
});

// New endpoint to download a plan file
app.get('/api/downloadPlanFile/:id', async (req, res) => {
    const riskId = req.params.id;
    // Check if riskId is valid (you may want to add additional validation)
    if (!riskId) {
        return res.status(400).json({ error: 'Invalid request data' });
    }
    try {
        // Use the pool to connect to the PostgreSQL database
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        // Define the SQL query to retrieve the plan file
        const fetchQuery = `
          SELECT id, planFiles, planFilesName
          FROM risk_items
          WHERE id = ${riskId}
        `;
        
        // Execute the query
        const { rows } = await client.query(fetchQuery);
        
        // Release the client
        await client.end();
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Risk item not found' });
        }
        const riskItem = rows[0];
        const planFilesData = riskItem.planfiles;
        const fileName = riskItem.planfilesname; // Replace with the actual file name

        const contentType = getContentTypeFromByteA(fileName);
        if (contentType === 'application/pdf') {
            res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.pdf`);
            res.setHeader('Content-Type', contentType);
        }
        else if (contentType === 'image/png') {
            res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.png"`);
            res.setHeader('Content-Type', contentType);
        }
        else {
            console.error('Unsupported file type: buffer', contentType);
            return res.status(500).json({ error: 'Unsupported file type' });
        }
        res.end(planFilesData);
    }
    catch (error) {
        console.error('Error downloading plan file:', error);
        return res.status(500).json({ error: 'Failed to download plan file' });
    }
});
// Function to determine content type from a file extension or other information
function getContentTypeFromByteA(fileName) {
    // Extract the file extension from the file name, or default to an empty string
    const fileExtension = (fileName.split('.').pop() || '').toLowerCase();
    // Map known file extensions to their corresponding content types
    const contentTypeMap = {
        pdf: 'application/pdf',
        png: 'image/png',
        // Add more file extensions and content types as needed
    };
    // Check if the file extension is mapped to a content type
    if (contentTypeMap[fileExtension]) {
        return contentTypeMap[fileExtension];
    }
    // If the file extension is not recognized, return a default content type
    return 'application/octet-stream'; // Generic binary data type
}
// Function to determine content type from Blob
function getContentTypeFromBlob(blob, fileName) {
    // Check if the Blob has a type property (MIME type)
    if (blob.type) {
        return blob.type;
    }
    // Extract the file extension from the file name
    const fileExtension = fileName.split('.').pop();
    // Determine the content type based on the file extension
    const contentType = mimeTypes.lookup(fileExtension) || 'application/octet-stream';
    return contentType;
}

app.post('/api/approveRiskItem/:riskId', async (req, res) => {
    const { riskId } = req.params;
    if (!riskId) {
        return res.status(400).json({ error: 'Invalid request data' });
    }
    const updateQuery = `
    UPDATE risk_items
    SET planApproval = 'aprovado'
    WHERE id = $1
  `;
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const result = await client.query(updateQuery, [riskId]);
        // End the client connection
        await client.end();
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Risk item not found' });
        }
        res.status(200).json({ message: 'Plan approved successfully' });
    }
    catch (error) {
        console.error('Error approving plan to the database:', error);
        return res.status(500).json({ error: 'Failed to approve plan to the database' });
    }
});

app.post('/api/rejectRiskItem/:riskId', async (req, res) => {
    const { riskId } = req.params;
    if (!riskId) {
        return res.status(400).json({ error: 'Invalid request data' });
    }
    const updateQuery = `
    UPDATE risk_items
    SET planApproval = 'reprovado'
    WHERE id = $1
  `;
    try {
        // Create a client for the database connection
        const client = (0, postgres_1.createClient)({
            connectionString: process.env.POSTGRES_URL_NON_POOLING, // Set your database connection string as an environment variable in Vercel.
        });
        await client.connect();
        const result = await client.query(updateQuery, [riskId]);
        // End the client connection
        await client.end();
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Risk item not found' });
        }
        res.status(200).json({ message: 'Plan disapproved successfully' });
    }
    catch (error) {
        console.error('Error disapproving plan to the database:', error);
        return res.status(500).json({ error: 'Failed to disapprove plan to the database' });
    }
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
