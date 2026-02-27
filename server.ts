import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(cors());
    app.use(express.json());

    const configPath = path.join(__dirname, 'config.json');

    // API routes
    app.get('/api/config', (req, res) => {
        fs.readFile(configPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading config file:', err);
                return res.status(500).json({ message: 'Error reading configuration' });
            }
            res.json(JSON.parse(data));
        });
    });

    app.post('/api/config', (req, res) => {
        const newConfig = req.body;
        fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error writing config file:', err);
                return res.status(500).json({ message: 'Error writing configuration' });
            }
            res.json({ message: 'Configuration updated successfully' });
        });
    });

    app.post('/api/upload', upload.array('files'), (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }
        
        const uploadedFiles = (req.files as Express.Multer.File[]).map(file => ({
            originalName: file.originalname,
            filename: file.filename,
            size: file.size,
            path: `/uploads/${file.filename}`
        }));

        res.json({ message: 'Files uploaded successfully', files: uploadedFiles });
    });

    // Serve uploaded files statically
    app.use('/uploads', express.static(uploadsDir));

    // Vite middleware
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
    });
    app.use(vite.middlewares);

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

startServer();
