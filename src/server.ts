import express, { Request as ExpressRequest, Response } from 'express';
import { Pool } from '@vercel/postgres';
import { RiskItem, AppliedChecklist } from '../../components/Modelagem/models';
import cors from 'cors';
import multer from 'multer'; // Import multer for handling file uploads
const bodyParser = require('body-parser');
const streamifier = require('streamifier'); // Import the 'streamifier' package
// Import the 'mime-types' library
const mimeTypes = require('mime-types');

// Define a custom type for Express Request that includes the 'file' property
type Request = ExpressRequest & { file?: Express.Multer.File };

const app = express();
const port = process.env.PORT || 5000;

// Increase the request size limit (e.g., 50MB)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(express.json());
app.use(cors());


// Configure multer to handle file uploads
const storage = multer.memoryStorage(); // Store file data in memory
const upload = multer({ storage: storage });

app.post('/api/riskItems', upload.single('planFiles'), async (req: Request, res: Response) => {
  console.log('Raw Request Body:', req.body);
  const newRisk = JSON.parse(req.body.json_data || '{}') as RiskItem;
  const planFiles = req.file ? req.file.buffer : null; // Get the uploaded file data
  const planFilesName = req.file ? req.file.originalname : '';
  
  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const insertQuery = `
      INSERT INTO risk_items (title, description, planDescription, planFiles, planFilesName, planApproval, likelihood, impact, date, responsibleChecklist, responsiblePlan, completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;

    const values = [
      newRisk.title || '',
      newRisk.description || '',
      newRisk.planDescription || '',
      planFiles, // Store the uploaded file data as BLOB
      planFilesName, // Store the uploaded file name
      newRisk.planApproval || '',
      newRisk.likelihood || '',
      newRisk.impact || '',
      newRisk.date || '',
      newRisk.responsibleChecklist || '',
      newRisk.responsiblePlan || '',
      newRisk.completed ? 1 : 0,
    ];

    const result = await pool.query(insertQuery, values);

    const id = result.rows[0].id;

    // Release the pool
    await pool.end();

    const createdRisk = {
      id,
      title: newRisk.title,
      description: newRisk.description,
      planDescription: newRisk.planDescription,
      planFiles: planFiles, // Return the binary data
      planFilesName: planFilesName,
      planApproval: newRisk.planApproval,
      likelihood: newRisk.likelihood,
      impact: newRisk.impact,
      date: newRisk.date,
      responsibleChecklist: newRisk.responsibleChecklist,
      responsiblePlan: newRisk.responsiblePlan,
      completed: newRisk.completed,
    };

    res.status(201).json(createdRisk);
  } catch (error) {
    console.error('Error adding risk item to the database:', error);
    return res.status(500).json({ error: 'Failed to add risk item to database' });
  }
});

// New endpoint to fetch all risk items
app.get('/api/riskItems', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1; // Default to page 1
  const itemsPerPage = parseInt(req.query.itemsPerPage as string) || 5; // Default to 10 items per page
  
  const offset = (page - 1) * itemsPerPage;

  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();
    const fetchQuery = `
      SELECT id, title, description, planDescription, planFiles, likelihood, impact, date, responsibleChecklist, responsiblePlan, completed
      FROM risk_items
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(fetchQuery, [itemsPerPage, offset]);
    // Release the pool
    await pool.end();

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
  } catch (error) {
    console.error('Error fetching risk items:', error);
    return res.status(500).json({ error: 'Failed to fetch risk items from the database' });
  }
});

app.get('/api/lastRiskItems', async (req: Request, res: Response) => {
  const numberOfLastItems = 5; // Adjust as needed

  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const fetchQuery = `
      SELECT id, title, description, planDescription, planFiles, likelihood, impact, date, responsibleChecklist, responsiblePlan, completed
      FROM risk_items
      ORDER BY id DESC
      LIMIT $1
    `;

    const result = await pool.query(fetchQuery, [numberOfLastItems]);
    // Release the pool
    await pool.end();

    const lastRiskItems = result.rows.map(row => ({
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

    res.json(lastRiskItems);
  } catch (error) {
    console.error('Error fetching last risk items:', error);
    return res.status(500).json({ error: 'Failed to fetch last risk items from the database' });
  }
});


app.put('/api/riskItems/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const updateField = req.body; // This should be an object containing the field to update and its new value

  if (!id || !updateField) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const updateQuery = `
      UPDATE risk_items
      SET ${Object.keys(updateField)[0]} = $1
      WHERE id = $2
    `;

    await pool.query(updateQuery, [Object.values(updateField)[0], id]);
    // Release the pool
    await pool.end();

    res.status(200).json({ message: 'Risk item updated successfully' });
  } catch (error) {
    console.error('Error updating risk item:', error);
    return res.status(500).json({ error: 'Failed to update risk item in the database' });
  }
});


app.get('/api/appliedChecklists', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1; // Default to page 1
  const itemsPerPage = parseInt(req.query.itemsPerPage as string) || 5; // Default to 5 items per page

  const offset = (page - 1) * itemsPerPage;

  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const fetchQuery = `
      SELECT id, title, dateApplied
      FROM applied_checklists
      LIMIT $1 OFFSET $2
    `;

    const { rows } = await pool.query(fetchQuery, [itemsPerPage, offset]);
    // Release the pool
    await pool.end();

    const appliedChecklists = rows.map(row => ({
      id: row.id,
      title: row.title,
      dateApplied: row.dateApplied,
    }));

    res.json(appliedChecklists);
  } catch (error) {
    console.error('Error fetching applied checklists:', error);
    return res.status(500).json({ error: 'Failed to fetch applied checklists from the database' });
  }
});


app.post('/api/appliedChecklists', async (req: Request, res: Response) => {
  const newAppliedChecklist = req.body as AppliedChecklist;

  if (!newAppliedChecklist) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  const { title, dateApplied } = newAppliedChecklist;

  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const insertQuery = `
      INSERT INTO applied_checklists (title, dateApplied)
      VALUES ($1, $2)
      RETURNING id
    `;

    const { rows } = await pool.query(insertQuery, [title || '', dateApplied || '']);
    // Release the pool
    await pool.end();

    const createdAppliedChecklist = {
      id: rows[0].id,
      title,
      dateApplied,
    };
    res.status(201).json(createdAppliedChecklist);
  } catch (error) {
    console.error('Error adding applied checklist to the database:', error);
    return res.status(500).json({ error: 'Failed to add applied checklist to the database' });
  }
});


app.get('/api/chartData', async (req: Request, res: Response) => {
  try {
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const fetchQuery = `
      SELECT planApproval
      FROM risk_items
    `;

    const { rows } = await pool.query(fetchQuery);

    // Release the pool
    await pool.end();

    const chartData = rows.map(row => ({
      planApproval: row.planApproval,
    }));

    res.json(chartData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    return res.status(500).json({ error: 'Failed to fetch chart data from the database' });
  }
});


// New endpoint to download a plan file
app.get('/api/downloadPlanFile/:id', async (req: Request, res: Response) => {
  const riskId = req.params.id;

  // Check if riskId is valid (you may want to add additional validation)
  if (!riskId) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    // Use the pool to connect to the PostgreSQL database
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    // Define the SQL query to retrieve the plan file
    const fetchQuery = `
      SELECT planFiles, planFilesName
      FROM risk_items
      WHERE id = $1
    `;

    // Execute the query
    const { rows } = await pool.query(fetchQuery, [riskId]);

    // Release the pool back to the pool
    // Release the pool
    await pool.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Risk item not found' });
    }

    const riskItem = rows[0];

    if (Buffer.isBuffer(riskItem.planFiles)) {
      const planFilesData = riskItem.planFiles as Buffer;
      const contentType = getContentTypeFromByteA(riskItem.planFilesName);

      if (contentType === 'application/pdf') {
        res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.pdf`);
        res.setHeader('Content-Type', contentType);
      } else if (contentType === 'image/png') {
        res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.png"`);
        res.setHeader('Content-Type', contentType);
      } else {
        console.error('Unsupported file type: buffer', contentType);
        return res.status(500).json({ error: 'Unsupported file type' });
      }

      
      res.end(planFilesData);
    } else {
      // Handle the case where 'planFiles' is stored as a Blob
      const planFilesData = riskItem.planFiles as Blob; // Assuming Blob data is stored as Uint8Array

      const fileName = riskItem.planFilesName; // Replace with the actual file name
      const contentType = getContentTypeFromBlob(planFilesData, fileName);

      if (contentType === 'application/pdf') {
        res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.pdf`);
        res.setHeader('Content-Type', contentType);
      } else if (contentType === 'image/png') {
        res.setHeader('Content-Disposition', `attachment; filename="Plan_${riskId}.png"`);
        res.setHeader('Content-Type', contentType);
      } else {
        console.error('Unsupported file type: blob', contentType);
        return res.status(500).json({ error: 'Unsupported file type' });
      }

      const readableStream = streamifier.createReadStream(planFilesData);

      readableStream.pipe(res);
    }
  } catch (error) {
    console.error('Error downloading plan file:', error);
    return res.status(500).json({ error: 'Failed to download plan file' });
  }
});


// Define a type for the content type map
type ContentTypeMap = {
  [key: string]: string;
};

// Function to determine content type from a file extension or other information
function getContentTypeFromByteA(fileName: string): string {
  // Extract the file extension from the file name, or default to an empty string
  const fileExtension = (fileName.split('.').pop() || '').toLowerCase();

  // Map known file extensions to their corresponding content types
  const contentTypeMap: ContentTypeMap = {
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
function getContentTypeFromBlob(blob: Blob, fileName: string): string {
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



app.post('/api/approveRiskItem/:riskId', async (req: Request, res: Response) => {
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
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const result = await pool.query(updateQuery, [riskId]);

    // End the pool connection
    await pool.end();

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Risk item not found' });
    }

    res.status(200).json({ message: 'Plan approved successfully' });
  } catch (error) {
    console.error('Error approving plan to the database:', error);
    return res.status(500).json({ error: 'Failed to approve plan to the database' });
  }
});

app.post('/api/rejectRiskItem/:riskId', async (req: Request, res: Response) => {
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
    // Create a pool for the database connection
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL, // Set your database connection string as an environment variable in Vercel.
    });

    await pool.connect();

    const result = await pool.query(updateQuery, [riskId]);

    // End the pool connection
    await pool.end();

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Risk item not found' });
    }

    res.status(200).json({ message: 'Plan disapproved successfully' });
  } catch (error) {
    console.error('Error disapproving plan to the database:', error);
    return res.status(500).json({ error: 'Failed to disapprove plan to the database' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
