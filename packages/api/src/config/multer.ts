import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UPLOAD_CONFIG } from './constants.js';
import { uploadsRoot } from './runtime.js';

// Configuração de armazenamento
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.join(uploadsRoot, 'temp'));
    },
    filename: (_req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});

// Validação de arquivos
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
    const allowedMimes = UPLOAD_CONFIG.allowedMimeTypes as readonly string[];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato de vídeo não suportado. Use MP4, MOV, AVI ou WebM.'), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: UPLOAD_CONFIG.maxFileSize
    }
});
