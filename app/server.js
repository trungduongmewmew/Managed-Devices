const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const port = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';


app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, 'uploads/'); },
  filename: function (req, file, cb) {
    const type = req.params.type === 'logical' ? 'logical' : 'physical';
    const extension = path.extname(file.originalname);
    cb(null, `${type}${extension}`);
  }
});


const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true); 
  } else {
    cb(new Error('Chỉ cho phép tải lên file ảnh!'), false); 
  }
};

const upload = multer({ storage: storage, fileFilter: imageFileFilter }); 


const pool = new Pool({  
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});


async function initializeDatabase() {  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS users (username VARCHAR(50) PRIMARY KEY, password_hash VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'viewer', must_change_password BOOLEAN DEFAULT FALSE);`);
    await client.query(`CREATE TABLE IF NOT EXISTS columns (key VARCHAR(50) PRIMARY KEY, label VARCHAR(100) NOT NULL);`);
    await client.query(`CREATE TABLE IF NOT EXISTS devices (id SERIAL PRIMARY KEY, data JSONB);`);
    await client.query(`CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, timestamp TIMESTAMPTZ DEFAULT NOW(), username VARCHAR(50), action VARCHAR(100), target_type VARCHAR(50), target_id VARCHAR(100), details JSONB);`);
    await client.query(`CREATE TABLE IF NOT EXISTS device_types (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL);`);
    await client.query(`CREATE TABLE IF NOT EXISTS topology (id VARCHAR(50) PRIMARY KEY, filename VARCHAR(255));`);
    await client.query(`CREATE TABLE IF NOT EXISTS utility_links (id SERIAL PRIMARY KEY, title VARCHAR(100) NOT NULL, url VARCHAR(500) NOT NULL, display_order INT DEFAULT 0);`);
    const adminExists = await client.query("SELECT 1 FROM users WHERE username = 'admin'");
    if (adminExists.rowCount === 0) { const salt = await bcrypt.genSalt(10); const adminHash = await bcrypt.hash('admin', salt); await client.query("INSERT INTO users (username, password_hash, role, must_change_password) VALUES ('admin', $1, 'admin', TRUE)", [adminHash]); }
    const colsExist = await client.query("SELECT 1 FROM columns LIMIT 1");
    if (colsExist.rowCount === 0) { const dc = [{k:'hostname',l:'Hostname'},{k:'ip',l:'Địa chỉ IP'},{k:'type',l:'Loại'},{k:'location',l:'Vị trí'},{k:'owner',l:'Người quản lý'},{k:'description',l:'Mô tả'}]; for(const c of dc){ await client.query("INSERT INTO columns (key, label) VALUES ($1, $2) ON CONFLICT DO NOTHING", [c.k, c.l]);} }
    const typesExist = await client.query("SELECT 1 FROM device_types LIMIT 1");
    if (typesExist.rowCount === 0) { const dt = ['Router','Switch','Firewall','Access Point','Server','PC/Laptop']; for(const t of dt){ await client.query("INSERT INTO device_types (name) VALUES ($1) ON CONFLICT DO NOTHING", [t]);} }
    const topoExist = await client.query("SELECT 1 FROM topology LIMIT 1");
    if (topoExist.rowCount === 0) { await client.query("INSERT INTO topology (id, filename) VALUES ('logical', null), ('physical', null) ON CONFLICT DO NOTHING"); }
    await client.query('COMMIT'); console.log('DB init OK.');
  } catch (e) { await client.query('ROLLBACK'); console.error('DB init Error:', e); throw e; } 
  finally { client.release(); }
}


async function logAudit(u, a, tt, ti, d={}) { try { await pool.query(`INSERT INTO audit_logs (username, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)`,[u,a,tt,ti,JSON.stringify(d)]); } catch (err) { console.error('Log Error:', err.message); } }
function authenticateToken(req, res, next) { const h = req.headers['authorization']; const t = h && h.split(' ')[1]; if (t == null) return res.sendStatus(401); jwt.verify(t, JWT_SECRET, (err, user) => { if (err) return res.sendStatus(403); req.user = user; next(); }); }
function isAdmin(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin required.' }); next(); }

-
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.post('/login', async (req, res) => {  
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rowCount === 0) return res.status(401).json({ message: 'Tên đăng nhập không tồn tại.' });
        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: 'Mật khẩu không chính xác.' });
        const token = jwt.sign({ username: user.username, role: user.role, mustChangePassword: user.must_change_password }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ status: 'success', token: token });
    } catch (err) { res.status(500).json({ message: err.message }); }
});
app.use('/api', authenticateToken);

app.get('/api/devices', async (req, res)=>{ try { const r = await pool.query("SELECT id, data FROM devices"); res.json(r.rows.map(rw => ({ id: rw.id, ...rw.data }))); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/devices', async (req, res)=>{ const d=req.body; d.owner_username=req.user.username; try { const r=await pool.query("INSERT INTO devices (data) VALUES ($1) RETURNING id, data",[d]); const n={id:r.rows[0].id,...r.rows[0].data}; await logAudit(req.user.username,'CREATE_DEVICE','device',n.id,n); res.status(201).json(n); } catch (e) { res.status(500).json({message:e.message}); } });
app.put('/api/devices/:id', async (req, res)=>{ const id=parseInt(req.params.id); const d=req.body; const {username,role}=req.user; try { const dr=await pool.query("SELECT data FROM devices WHERE id = $1",[id]); if(dr.rowCount===0) return res.status(404).json({message:'Not found'}); const o=dr.rows[0].data.owner_username; if(role!=='admin'&&username!==o) return res.status(403).json({message:'Forbidden'}); d.owner_username=o; const r=await pool.query("UPDATE devices SET data = $1 WHERE id = $2 RETURNING id, data",[d,id]); const u={id:r.rows[0].id,...r.rows[0].data}; await logAudit(username,'UPDATE_DEVICE','device',id,u); res.json(u); } catch (e) { res.status(500).json({message:e.message}); } });
app.delete('/api/devices/:id', async (req, res)=>{ const id=parseInt(req.params.id); const {username,role}=req.user; try { const dr=await pool.query("SELECT data FROM devices WHERE id = $1",[id]); if(dr.rowCount===0) return res.status(404).json({message:'Not found'}); const o=dr.rows[0].data.owner_username; if(role!=='admin'&&username!==o) return res.status(403).json({message:'Forbidden'}); await pool.query("DELETE FROM devices WHERE id = $1",[id]); await logAudit(username,'DELETE_DEVICE','device',id); res.status(204).send(); } catch (e) { res.status(500).json({message:e.message}); } });

app.get('/api/columns', async (req, res)=>{ try { const r=await pool.query("SELECT * FROM columns"); res.json(r.rows); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/columns', isAdmin, async (req, res)=>{ const {key,label}=req.body; try { await pool.query("INSERT INTO columns (key, label) VALUES ($1, $2)",[key,label]); await logAudit(req.user.username,'CREATE_COLUMN','column',key,{label}); res.status(201).json({key,label}); } catch (e) { res.status(500).json({message:e.message}); } });
app.put('/api/columns/:key', isAdmin, async (req, res)=>{ const {key}=req.params; const {label}=req.body; try { await pool.query("UPDATE columns SET label = $1 WHERE key = $2",[label,key]); await logAudit(req.user.username,'UPDATE_COLUMN','column',key,{label}); res.json({key,label}); } catch (e) { res.status(500).json({message:e.message}); } });
app.delete('/api/columns/:key', isAdmin, async (req, res)=>{ const {key}=req.params; try { await pool.query("DELETE FROM columns WHERE key = $1",[key]); await pool.query("UPDATE devices SET data = data - $1",[key]); await logAudit(req.user.username,'DELETE_COLUMN','column',key); res.status(204).send(); } catch (e) { res.status(500).json({message:e.message}); } });

app.get('/api/users', isAdmin, async (req, res)=>{ try { const r=await pool.query("SELECT username, role FROM users"); res.json(r.rows); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/users', isAdmin, async (req, res)=>{ const {username,password,role}=req.body; try { const s=await bcrypt.genSalt(10); const h=await bcrypt.hash(password,s); await pool.query("INSERT INTO users (username, password_hash, role, must_change_password) VALUES ($1, $2, $3, TRUE)",[username,h,role]); await logAudit(req.user.username,'CREATE_USER','user',username,{role}); res.status(201).json({username,role}); } catch (e) { res.status(500).json({message:e.message}); } });
app.put('/api/users/:username', isAdmin, async (req, res)=>{ const {username}=req.params; const {role}=req.body; try { await pool.query("UPDATE users SET role = $1 WHERE username = $2",[role,username]); await logAudit(req.user.username,'UPDATE_USER_ROLE','user',username,{role}); res.json({username,role}); } catch (e) { res.status(500).json({message:e.message}); } });
app.delete('/api/users/:username', isAdmin, async (req, res)=>{ const {username}=req.params; try { await pool.query("DELETE FROM users WHERE username = $1",[username]); await logAudit(req.user.username,'DELETE_USER','user',username); res.status(204).send(); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/user/change-password', async (req, res) => { const { currentPassword, newPassword } = req.body; const { username } = req.user; if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới.' }); try { const result = await pool.query('SELECT password_hash FROM users WHERE username = $1', [username]); if (result.rowCount === 0) return res.status(404).json({ message: 'Không tìm thấy người dùng.' }); const user = result.rows[0]; const isMatch = await bcrypt.compare(currentPassword, user.password_hash); if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.' }); const salt = await bcrypt.genSalt(10); const newHash = await bcrypt.hash(newPassword, salt); await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE username = $2', [newHash, username]); await logAudit(username, 'CHANGE_PASSWORD', 'user', username); res.json({ message: 'Đổi mật khẩu thành công!' }); } catch (err) { res.status(500).json({ message: err.message }); } });

app.get('/api/backup', isAdmin, async (req, res)=>{ try { const u=await pool.query("SELECT username, password_hash, role, must_change_password FROM users"); const c=await pool.query("SELECT key, label FROM columns"); const d=await pool.query("SELECT data FROM devices"); const l=await pool.query("SELECT * FROM utility_links"); const b={users:u.rows,columns:c.rows,devices:d.rows,links:l.rows}; await logAudit(req.user.username,'BACKUP_DATA','system','all'); res.setHeader('Content-Type','application/json'); res.setHeader('Content-Disposition','attachment; filename=backup.json'); res.json(b); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/restore', isAdmin, async (req, res)=>{ const {users,columns,devices,links}=req.body; const cl=await pool.connect(); try { await cl.query('BEGIN'); await cl.query('TRUNCATE users, columns, devices, utility_links RESTART IDENTITY CASCADE'); for(const u of users) await cl.query("INSERT INTO users (username, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4)",[u.username,u.password_hash,u.role, u.must_change_password || false]); for(const c of columns) await cl.query("INSERT INTO columns (key, label) VALUES ($1, $2)",[c.key,c.label]); for(const d of devices) await cl.query("INSERT INTO devices (data) VALUES ($1)",[d.data]); if(links) for(const l of links) await cl.query("INSERT INTO utility_links (title, url, display_order) VALUES ($1, $2, $3)",[l.title,l.url,l.display_order]); await cl.query('COMMIT'); await logAudit(req.user.username,'RESTORE_DATA','system','all'); res.json({message:'Phục hồi OK!'}); } catch (e) { await cl.query('ROLLBACK'); res.status(500).json({message:`Lỗi restore: ${e.message}`}); } finally { cl.release(); } });

app.get('/api/types', async (req, res)=>{ try { const r=await pool.query("SELECT * FROM device_types ORDER BY name"); res.json(r.rows); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/types', isAdmin, async (req, res)=>{ const {name}=req.body; try { const r=await pool.query("INSERT INTO device_types (name) VALUES ($1) RETURNING *",[name]); await logAudit(req.user.username,'CREATE_TYPE','type',r.rows[0].id,{name}); res.status(201).json(r.rows[0]); } catch (e) { res.status(500).json({message:e.message}); } });
app.delete('/api/types/:id', isAdmin, async (req, res)=>{ const id=parseInt(req.params.id); try { await pool.query("DELETE FROM device_types WHERE id = $1",[id]); await logAudit(req.user.username,'DELETE_TYPE','type',id); res.status(204).send(); } catch (e) { res.status(500).json({message:e.message}); } });

app.get('/api/topology', async (req, res)=>{ try { const r=await pool.query("SELECT * FROM topology"); const d=r.rows.reduce((a,rw)=>{a[rw.id]=rw.filename?`/uploads/${rw.filename}?v=${Date.now()}`:null; return a;},{}); res.json(d); } catch (e) { res.status(500).json({message:e.message}); } });

app.post('/api/topology/:type', isAdmin, (req, res, next) => {
    upload.single('topology_image')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            
            return res.status(400).json({ message: `Lỗi tải lên: ${err.message}` });
        } else if (err) {
            
             return res.status(400).json({ message: err.message || 'Lỗi không xác định khi tải lên.' });
        }
        
        next();
    });
}, async (req, res) => {  
    const { type } = req.params;
    if (!req.file) return res.status(400).json({ message: 'Không có file.' });
    const filename = req.file.filename;
    try {
        await pool.query("UPDATE topology SET filename = $1 WHERE id = $2", [filename, type]);
        await logAudit(req.user.username, 'UPDATE_TOPOLOGY', 'topology', type, { filename });
        res.json({ success: true, filename: filename, path: `/uploads/${filename}` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/audit-logs', isAdmin, async (req, res)=>{ try { const r=await pool.query("SELECT id, TO_CHAR(timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') as timestamp, username, action, target_type, target_id FROM audit_logs ORDER BY id DESC LIMIT 200"); res.json(r.rows); } catch (e) { res.status(500).json({message:e.message}); } });

app.get('/api/links', async (req, res)=>{ try { const r=await pool.query("SELECT * FROM utility_links ORDER BY display_order, title"); res.json(r.rows); } catch (e) { res.status(500).json({message:e.message}); } });
app.post('/api/links', isAdmin, async (req, res)=>{ const {title,url,display_order}=req.body; try { const r=await pool.query("INSERT INTO utility_links (title, url, display_order) VALUES ($1, $2, $3) RETURNING *",[title,url,display_order||0]); await logAudit(req.user.username,'CREATE_LINK','link',r.rows[0].id,{title,url}); res.status(201).json(r.rows[0]); } catch (e) { res.status(500).json({message:e.message}); } });
app.put('/api/links/:id', isAdmin, async (req, res)=>{ const id=parseInt(req.params.id); const {title,url,display_order}=req.body; try { const r=await pool.query("UPDATE utility_links SET title = $1, url = $2, display_order = $3 WHERE id = $4 RETURNING *",[title,url,display_order||0,id]); await logAudit(req.user.username,'UPDATE_LINK','link',id,{title,url}); res.json(r.rows[0]); } catch (e) { res.status(500).json({message:e.message}); } });
app.delete('/api/links/:id', isAdmin, async (req, res)=>{ const id=parseInt(req.params.id); try { await pool.query("DELETE FROM utility_links WHERE id = $1",[id]); await logAudit(req.user.username,'DELETE_LINK','link',id); res.status(204).send(); } catch (e) { res.status(500).json({message:e.message}); } });


app.listen(port, () => { console.log(`Server running at http://localhost:${port}`); initializeDatabase().catch(console.error); });