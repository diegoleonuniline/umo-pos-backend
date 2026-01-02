const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración AppSheet
const APP_ID = '317b1c5c-33b0-4c4b-b3f6-40c925e05237';
const ACCESS_KEY = 'V2-htkz3-r0477-0iLrM-Jhq7C-2uehz-liV0b-sVTAT-n23hT';
const API_BASE = 'https://www.appsheet.com/api/v2/apps';

// ============================================
// SISTEMA DE CACHÉ
// ============================================
const CACHE = {
    productos: { data: null, timestamp: null },
    clientes: { data: null, timestamp: null },
    usuarios: { data: null, timestamp: null },
    metodosPago: { data: null, timestamp: null },
    descuentos: { data: null, timestamp: null },
    promociones: { data: null, timestamp: null },
    categorias: { data: null, timestamp: null },
    conceptos: { data: null, timestamp: null },
    bancos: { data: null, timestamp: null }
};

function getCacheStatus() {
    const status = {};
    for (const key in CACHE) {
        status[key] = {
            loaded: CACHE[key].data !== null,
            items: CACHE[key].data ? CACHE[key].data.length : 0,
            timestamp: CACHE[key].timestamp
        };
    }
    return status;
}

// ============================================
// CORS
// ============================================
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));
app.options('*', cors());
app.use(express.json());

// ============================================
// UTILIDADES
// ============================================
function formatearFechaAppSheet(fecha) {
    const d = fecha || new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    const anio = d.getFullYear();
    return `${mes}/${dia}/${anio}`;
}

function formatearHoraAppSheet(fecha) {
    const d = fecha || new Date();
    let horas = d.getHours();
    const minutos = String(d.getMinutes()).padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas ? horas : 12;
    return `${horas}:${minutos} ${ampm}`;
}

async function appsheetRequest(tabla, action, rows = [], selector = null) {
    const url = `${API_BASE}/${APP_ID}/tables/${encodeURIComponent(tabla)}/Action?applicationAccessKey=${ACCESS_KEY}`;
    
    const payload = {
        Action: action,
        Properties: { Locale: 'es-MX', Timezone: 'America/Mexico_City' },
        Rows: rows
    };
    
    if (selector) {
        payload.Properties.Selector = selector;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    if (!response.ok) {
        throw new Error(`AppSheet Error: ${responseText}`);
    }

    if (!responseText || responseText.trim() === '') {
        return [];
    }

    try {
        return JSON.parse(responseText);
    } catch (e) {
        return [];
    }
}

// ============================================
// FUNCIONES DE CARGA DE CACHÉ
// ============================================
async function cargarProductos() {
    const productos = await appsheetRequest('Productos', 'Find');
    CACHE.productos.data = (Array.isArray(productos) ? productos : [])
        .filter(p => {
            const sePuedeVender = p['SE PUEDE VENDER'];
            if (sePuedeVender === undefined || sePuedeVender === '') return true;
            return sePuedeVender === true || sePuedeVender === 'true' || sePuedeVender === 'TRUE';
        })
        .map(p => ({
            codigoBarras: p['Codigo De Barras'] || p['CODIGO DE BARRAS'] || '',
            sku: p['SKU'] || p['Codigo De Barras'] || '',
            nombre: p['Nombre'] || p['NOMBRE'] || 'Sin nombre',
            precio: parseFloat(p['Precio'] || p['PRECIO']) || 0,
            categoria: p['Categorias'] || p['CATEGORIAS'] || 'Sin categoría',
            stock: parseFloat(p['Stock'] || p['STOCK']) || 0,
            imagen: p['IMAGEN'] || null
        }));
    CACHE.productos.timestamp = new Date().toISOString();
    return CACHE.productos.data;
}

async function cargarClientes() {
    const clientes = await appsheetRequest('Clientes', 'Find');
    CACHE.clientes.data = (Array.isArray(clientes) ? clientes : []).map(c => ({
        codigo: c['Codigo'] || c['CODIGO'] || c['Id'] || '',
        nombre: c['Nombre'] || c['NOMBRE'] || 'Sin nombre',
        correo: c['Correo'] || c['CORREO'] || '',
        telefono: c['Telefono'] || c['TELEFONO'] || '',
        grupo: c['Grupo'] || c['GRUPO'] || ''
    }));
    CACHE.clientes.timestamp = new Date().toISOString();
    return CACHE.clientes.data;
}

async function cargarUsuarios() {
    const usuarios = await appsheetRequest('Usuarios', 'Find');
    CACHE.usuarios.data = Array.isArray(usuarios) ? usuarios : [];
    CACHE.usuarios.timestamp = new Date().toISOString();
    return CACHE.usuarios.data;
}

async function cargarMetodosPago() {
    const metodos = await appsheetRequest('Metodos de pago', 'Find');
    CACHE.metodosPago.data = (Array.isArray(metodos) ? metodos : [])
        .map(m => m['Metodo de pago'] || m['Método de pago'] || m['METODO DE PAGO'] || 'Sin nombre');
    if (CACHE.metodosPago.data.length === 0) {
        CACHE.metodosPago.data = ['Efectivo', 'Tarjeta', 'Transferencia'];
    }
    CACHE.metodosPago.timestamp = new Date().toISOString();
    return CACHE.metodosPago.data;
}

async function cargarDescuentos() {
    const descuentos = await appsheetRequest('Tabla Descuentos', 'Find');
    CACHE.descuentos.data = (Array.isArray(descuentos) ? descuentos : []).map((d, i) => {
        const id = d.Id || d.ID || `DES-${i+1}`;
        const nombre = d.Nombre || d.NOMBRE || '';
        const grupo = d.Grupo || d.GRUPO || '';
        const metodoPago = d['Metodo de Pago'] || d['Método de Pago'] || d['METODO DE PAGO'] || '';
        
        let porcentaje = 0;
        const rawPct = d.Porcentaje || d['%'] || d.PCT || 0;
        if (rawPct) {
            let s = String(rawPct).replace('%', '').replace(',', '.').trim();
            porcentaje = parseFloat(s) || 0;
            if (porcentaje > 0 && porcentaje <= 1) porcentaje = porcentaje * 100;
        }
        
        let etiqueta = '';
        if (grupo && metodoPago) etiqueta = `${grupo} + ${metodoPago} (${porcentaje}%)`;
        else if (grupo) etiqueta = `Grupo: ${grupo} (${porcentaje}%)`;
        else if (metodoPago) etiqueta = `Método: ${metodoPago} (${porcentaje}%)`;
        else etiqueta = `${nombre || 'Descuento'} (${porcentaje}%)`;

        return { id: String(id).trim(), nombre: String(nombre).trim(), grupo: String(grupo).trim(), metodoPago: String(metodoPago).trim(), porcentaje, etiqueta };
    });
    CACHE.descuentos.timestamp = new Date().toISOString();
    return CACHE.descuentos.data;
}

async function cargarPromociones() {
    const promociones = await appsheetRequest('Promociones', 'Find', [], `Filter(Promociones, [Estado] = "Activa")`);
    CACHE.promociones.data = (Array.isArray(promociones) ? promociones : []).map(p => ({
        id: p.Id,
        basadaEn: p['Basada en'],
        forma: p.Forma,
        categoria: p.Categoria || '',
        productos: p.Productos ? String(p.Productos).split(',').map(s => s.trim()) : [],
        diasPromocion: p['Dias de Promocion'] || '',
        fechaInicio: p['Fecha Inicio'],
        fechaFin: p['Fecha Fin'],
        porcentaje: (parseFloat(p['PorCentaje de Descuento']) || 0) * 100,
        precio: parseFloat(p.Precio) || 0,
        cantidadPagada: parseInt(p['Cantidad Pagada']) || 0,
        cantidadLlevar: parseInt(p['Cantidad a Llevar']) || 0,
        etiqueta: p.Etiqueta || ''
    }));
    CACHE.promociones.timestamp = new Date().toISOString();
    return CACHE.promociones.data;
}

async function cargarCategorias() {
    const categorias = await appsheetRequest('Categoria', 'Find');
    CACHE.categorias.data = (Array.isArray(categorias) ? categorias : []).map(c => ({
        id: c.ID || c.Id || '',
        nombre: c.Categoria || ''
    }));
    CACHE.categorias.timestamp = new Date().toISOString();
    return CACHE.categorias.data;
}

async function cargarConceptos() {
    const conceptos = await appsheetRequest('Concepto', 'Find');
    CACHE.conceptos.data = (Array.isArray(conceptos) ? conceptos : []).map(c => ({
        id: c.ID || c.Id || '',
        nombre: c.Concepto || '',
        categoria: c.Categoria || ''
    }));
    CACHE.conceptos.timestamp = new Date().toISOString();
    return CACHE.conceptos.data;
}

async function cargarBancos() {
    const bancos = await appsheetRequest('Bancos', 'Find');
    CACHE.bancos.data = (Array.isArray(bancos) ? bancos : []).map(b => ({
        id: b.Id || b.ID || '',
        nombre: b.Banco || ''
    }));
    CACHE.bancos.timestamp = new Date().toISOString();
    return CACHE.bancos.data;
}

// ============================================
// SINCRONIZACIÓN COMPLETA
// ============================================
async function sincronizarTodo() {
    console.log('🔄 Sincronizando...');
    const inicio = Date.now();
    
    await Promise.all([
        cargarProductos(),
        cargarClientes(),
        cargarUsuarios(),
        cargarMetodosPago(),
        cargarDescuentos(),
        cargarPromociones(),
        cargarCategorias(),
        cargarConceptos(),
        cargarBancos()
    ]);
    
    const tiempo = Date.now() - inicio;
    console.log(`✅ Sync completo en ${tiempo}ms`);
    return { success: true, tiempo, cache: getCacheStatus() };
}

// ============================================
// ENDPOINT DE SINCRONIZACIÓN
// ============================================
app.post('/api/sync', async (req, res) => {
    try {
        const resultado = await sincronizarTodo();
        res.json(resultado);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sync/status', (req, res) => {
    res.json({ success: true, cache: getCacheStatus() });
});

// ============================================
// LOGIN
// ============================================
app.post('/api/login', async (req, res) => {
    try {
        const { empleadoId, pin } = req.body;
        
        if (!empleadoId || !pin) {
            return res.status(400).json({ success: false, error: 'ID y PIN requeridos' });
        }

        if (!CACHE.usuarios.data) await cargarUsuarios();
        
        const usuario = CACHE.usuarios.data.find(u => 
            String(u['ID Empleado']).trim() === String(empleadoId).trim() && 
            String(u['Pin de Acceso a Sistema']).trim() === String(pin).trim()
        );

        if (!usuario) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
        }

        res.json({ 
            success: true, 
            usuario: {
                id: usuario['ID Empleado'],
                nombre: usuario['Nombre'] || 'Usuario',
                nombreCompleto: usuario['Nombre Completo'] || `${usuario['Nombre'] || ''} ${usuario['Apellido Paterno'] || ''} ${usuario['Apellido Materno'] || ''}`.trim(),
                sucursal: usuario['Sucursal'] || 'Principal',
                rol: usuario['Puesto'] || 'Vendedor'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// TURNOS
// ============================================
app.get('/api/turnos/activo/:usuario/:sucursal', async (req, res) => {
    try {
        const { usuario, sucursal } = req.params;
        
        if (!CACHE.usuarios.data) await cargarUsuarios();
        
        let nombreUsuario = null;
        const usuarioEncontrado = CACHE.usuarios.data.find(u => 
            String(u['ID Empleado']).trim() === String(usuario).trim()
        );
        if (usuarioEncontrado) {
            nombreUsuario = usuarioEncontrado['Nombre'];
        }
        
        const turnos = await appsheetRequest('AbrirTurno', 'Find', [], `Filter(AbrirTurno, AND([Estado] = "Abierto", [Sucursal] = "${sucursal}"))`);
        
        if (!Array.isArray(turnos) || turnos.length === 0) {
            return res.json({ success: true, turnoActivo: null });
        }
        
        const turnoActivo = turnos.find(t => {
            const tUsuario = String(t.Usuario || '').trim().toLowerCase();
            if (tUsuario === usuario.toLowerCase()) return true;
            if (nombreUsuario && tUsuario === nombreUsuario.toLowerCase()) return true;
            return false;
        });

        res.json({ success: true, turnoActivo: turnoActivo || null });
    } catch (error) {
        console.error('Error turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/turnos/abrir', async (req, res) => {
    try {
        const { usuario, empleadoId, sucursal, efectivoInicial, usdInicial, cadInicial, eurInicial, tasaUSD, tasaCAD, tasaEUR } = req.body;

        const ahora = new Date();
        const turnoData = {
            Fecha: formatearFechaAppSheet(ahora),
            'Hora Apertura': formatearHoraAppSheet(ahora),
            Usuario: usuario,
            'ID Empleado': empleadoId || '',
            Sucursal: sucursal,
            Estado: 'Abierto',
            Efectivo: parseFloat(efectivoInicial) || 0,
            USD: parseFloat(usdInicial) || 0,
            CAD: parseFloat(cadInicial) || 0,
            EUR: parseFloat(eurInicial) || 0,
            'USD a MXN': parseFloat(tasaUSD) || 17.5,
            'CAD a MXN': parseFloat(tasaCAD) || 13,
            'EUR a MXN': parseFloat(tasaEUR) || 19
        };

        const result = await appsheetRequest('AbrirTurno', 'Add', [turnoData]);
        
        let turnoId = 'TRN-' + Date.now();
        if (result && result.Rows && result.Rows[0] && result.Rows[0].ID) {
            turnoId = result.Rows[0].ID;
        }

        res.json({ success: true, turnoId, mensaje: 'Turno abierto' });
    } catch (error) {
        console.error('Error abriendo turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/turnos/cerrar', async (req, res) => {
    try {
        const { turnoId, monedas1, monedas2, monedas5, monedas10, monedas20, billetes20, billetes50, billetes100, billetes200, billetes500, billetes1000, conteoUSD, conteoCAD, conteoEUR, bbvaNacional, bbvaInternacional, clipNacional, clipInternacional, transferencia, observaciones } = req.body;

        const totalMXN = 
            (parseFloat(monedas1) || 0) * 1 + (parseFloat(monedas2) || 0) * 2 + (parseFloat(monedas5) || 0) * 5 +
            (parseFloat(monedas10) || 0) * 10 + (parseFloat(monedas20) || 0) * 20 + (parseFloat(billetes20) || 0) * 20 +
            (parseFloat(billetes50) || 0) * 50 + (parseFloat(billetes100) || 0) * 100 + (parseFloat(billetes200) || 0) * 200 +
            (parseFloat(billetes500) || 0) * 500 + (parseFloat(billetes1000) || 0) * 1000;

        const updateData = {
            ID: turnoId,
            'Hora de Cierre': formatearHoraAppSheet(),
            Estado: 'Cerrado',
            'Monedas de $1 MXN': parseFloat(monedas1) || 0,
            'Monedas de $2 MXN': parseFloat(monedas2) || 0,
            'Monedas de $5 MXN': parseFloat(monedas5) || 0,
            'Monedas de $10 MXN': parseFloat(monedas10) || 0,
            'Monedas de $20 MXN': parseFloat(monedas20) || 0,
            'Billetes de $20 MXN': parseFloat(billetes20) || 0,
            'Billetes de $50 MXN': parseFloat(billetes50) || 0,
            'Billetes de $100 MXN': parseFloat(billetes100) || 0,
            'Billetes de $200 MXN': parseFloat(billetes200) || 0,
            'Billetes de $500 MXN': parseFloat(billetes500) || 0,
            'Billetes de $1000 MXN': parseFloat(billetes1000) || 0,
            'Total MXN (Calculado)': totalMXN,
            '💵 USD': parseFloat(conteoUSD) || 0,
            '🍁 CAD': parseFloat(conteoCAD) || 0,
            '🇪🇺 EUR': parseFloat(conteoEUR) || 0,
            'BBVA Nacional': parseFloat(bbvaNacional) || 0,
            'BBVA Internacional': parseFloat(bbvaInternacional) || 0,
            'Clip Nacional': parseFloat(clipNacional) || 0,
            'Clip Internacional': parseFloat(clipInternacional) || 0,
            'Transferencia electrónica de fondos': parseFloat(transferencia) || 0,
            Observaciones: observaciones || ''
        };

        await appsheetRequest('AbrirTurno', 'Edit', [updateData]);
        res.json({ success: true, totalMXN, mensaje: 'Turno cerrado' });
    } catch (error) {
        console.error('Error cerrando turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PRODUCTOS (CACHÉ)
// ============================================
app.get('/api/productos', async (req, res) => {
    try {
        if (!CACHE.productos.data) await cargarProductos();
        res.json({ success: true, productos: CACHE.productos.data, fromCache: true, timestamp: CACHE.productos.timestamp });
    } catch (error) {
        console.error('Error productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CLIENTES (CACHÉ)
// ============================================
app.get('/api/clientes', async (req, res) => {
    try {
        if (!CACHE.clientes.data) await cargarClientes();
        res.json({ success: true, clientes: CACHE.clientes.data, fromCache: true, timestamp: CACHE.clientes.timestamp });
    } catch (error) {
        console.error('Error clientes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clientes', async (req, res) => {
    try {
        const { codigo, nombre, correo, telefono, grupo } = req.body;
        
        if (!nombre) {
            return res.status(400).json({ success: false, error: 'Nombre requerido' });
        }

        const clienteData = {
            Codigo: codigo || `CLI-${Date.now()}`,
            Nombre: nombre,
            Correo: correo || '',
            Telefono: telefono || '',
            Grupo: grupo || ''
        };

        await appsheetRequest('Clientes', 'Add', [clienteData]);
        
        if (CACHE.clientes.data) {
            CACHE.clientes.data.push({
                codigo: clienteData.Codigo,
                nombre: clienteData.Nombre,
                correo: clienteData.Correo,
                telefono: clienteData.Telefono,
                grupo: clienteData.Grupo
            });
        }
        
        res.json({ success: true, codigo: clienteData.Codigo });
    } catch (error) {
        console.error('Error cliente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MÉTODOS DE PAGO (CACHÉ)
// ============================================
app.get('/api/metodos-pago', async (req, res) => {
    try {
        if (!CACHE.metodosPago.data) await cargarMetodosPago();
        res.json({ success: true, metodos: CACHE.metodosPago.data, fromCache: true });
    } catch (error) {
        res.json({ success: true, metodos: ['Efectivo', 'Tarjeta', 'Transferencia'] });
    }
});

// ============================================
// DESCUENTOS (CACHÉ)
// ============================================
app.get('/api/descuentos', async (req, res) => {
    try {
        if (!CACHE.descuentos.data) await cargarDescuentos();
        res.json({ success: true, descuentos: CACHE.descuentos.data, fromCache: true });
    } catch (error) {
        console.error('Error descuentos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/descuentos/calcular', async (req, res) => {
    try {
        const { grupoCliente, metodoPago } = req.body;
        
        if (!CACHE.descuentos.data) await cargarDescuentos();
        
        if (!CACHE.descuentos.data || CACHE.descuentos.data.length === 0) {
            return res.json({ success: true, porcentaje: 0, descripcion: 'Sin descuento', id: null });
        }
        
        const grupoNorm = (grupoCliente || '').toLowerCase().trim();
        const metodoNorm = (metodoPago || '').toLowerCase().trim();
        
        // Prioridad 1: Grupo + Método
        for (let d of CACHE.descuentos.data) {
            if (d.grupo.toLowerCase() === grupoNorm && d.metodoPago.toLowerCase() === metodoNorm && d.grupo && d.metodoPago) {
                return res.json({ success: true, porcentaje: d.porcentaje, descripcion: `${d.grupo} + ${d.metodoPago}`, id: d.id });
            }
        }
        
        // Prioridad 2: Solo grupo
        for (let d of CACHE.descuentos.data) {
            if (d.grupo.toLowerCase() === grupoNorm && !d.metodoPago && d.grupo) {
                return res.json({ success: true, porcentaje: d.porcentaje, descripcion: `Grupo: ${d.grupo}`, id: d.id });
            }
        }
        
        // Prioridad 3: Solo método
        for (let d of CACHE.descuentos.data) {
            if (d.metodoPago.toLowerCase() === metodoNorm && !d.grupo && d.metodoPago) {
                return res.json({ success: true, porcentaje: d.porcentaje, descripcion: `Método: ${d.metodoPago}`, id: d.id });
            }
        }
        
        res.json({ success: true, porcentaje: 0, descripcion: 'Sin descuento', id: null });
    } catch (error) {
        console.error('Error descuento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PROMOCIONES (CACHÉ)
// ============================================
app.get('/api/promociones', async (req, res) => {
    try {
        if (!CACHE.promociones.data) await cargarPromociones();
        res.json({ success: true, promociones: CACHE.promociones.data, fromCache: true });
    } catch (error) {
        console.error('Error promociones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// REGISTRAR VENTA
// ============================================
app.post('/api/ventas', async (req, res) => {
    try {
        const { venta, detalles, pagos } = req.body;

        const ventaData = {
            IdVenta: venta.IdVenta,
            Sucursal: venta.Sucursal || '',
            Vendedor: venta.Vendedor || '',
            Cliente: venta.Cliente || 'Público General',
            TipoDescuento: venta.TipoDescuento || 'Ninguno',
            Observaciones: venta.Observaciones || '',
            'Descuento Extra': parseFloat(venta.DescuentoExtra) || 0,
            'Agregado por': venta.Vendedor || '',
            TurnoId: venta.TurnoId || '',
            'Estado Venta': 'Cerrada'
        };

        const detallesData = (detalles || []).map(d => ({
            ID: d.ID,
            Ventas: venta.IdVenta,
            Producto: d.Producto,
            Cantidad: d.Cantidad,
            Precio: d.Precio,
            SubTotal: d.SubTotal,
            Descuento: d.Descuento,
            Total: d.Total,
            Status: 'Activo',
            SucursaldeRegistro: venta.Sucursal || ''
        }));

        const pagosData = (pagos || []).map(p => ({
            Id: p.Id,
            Ventas: venta.IdVenta,
            Monto: p.Monto,
            Moneda: p.Moneda,
            Metodo: p.Metodo,
            'Tasa de Cambio': p['Tasa de Cambio'] || 1,
            SucursaldeRegistro: venta.Sucursal || '',
            'Grupo Cliente': venta.GrupoCliente || '',
            Cliente: venta.Cliente || 'Público General',
            Vendedor: venta.Vendedor || '',
            Estado: 'Activo'
        }));

        await Promise.all([
            appsheetRequest('Ventas', 'Add', [ventaData]),
            detallesData.length > 0 ? appsheetRequest('Detalle Venta', 'Add', detallesData) : Promise.resolve(),
            pagosData.length > 0 ? appsheetRequest('Pagos', 'Add', pagosData) : Promise.resolve()
        ]);

        res.json({ success: true, ventaId: venta.IdVenta, mensaje: 'Venta registrada' });
    } catch (error) {
        console.error('Error venta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// VENTAS DEL TURNO
// ============================================
app.get('/api/ventas/turno/:turnoId', async (req, res) => {
    try {
        const { turnoId } = req.params;
        const ventas = await appsheetRequest('Ventas', 'Find', [], `Filter(Ventas, [TurnoId] = "${turnoId}")`);
        
        const ventasTurno = (Array.isArray(ventas) ? ventas : [])
            .map(v => ({
                idVenta: v.IdVenta || v.ID,
                fecha: v.Fecha || '',
                hora: v.Hora || v['Hora de Venta'] || '',
                cliente: v.Cliente || 'Público General',
                vendedor: v.Vendedor || '',
                sucursal: v.Sucursal || '',
                total: parseFloat(v.Total || v['Total Venta'] || 0),
                estado: v['Estado Venta'] || 'Completada',
                descuento: v.TipoDescuento || ''
            }))
            .sort((a, b) => b.idVenta.localeCompare(a.idVenta));

        res.json({ success: true, ventas: ventasTurno });
    } catch (error) {
        console.error('Error ventas turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// DETALLE DE VENTA
// ============================================
app.get('/api/ventas/:idVenta/detalle', async (req, res) => {
    try {
        const { idVenta } = req.params;
        
        const [ventas, detalles, pagosTabla] = await Promise.all([
            appsheetRequest('Ventas', 'Find', [], `Filter(Ventas, [IdVenta] = "${idVenta}")`),
            appsheetRequest('Detalle Venta', 'Find', [], `Filter(Detalle Venta, [Ventas] = "${idVenta}")`),
            appsheetRequest('Pagos', 'Find', [], `Filter(Pagos, [Ventas] = "${idVenta}")`)
        ]);
        
        const venta = Array.isArray(ventas) && ventas.length > 0 ? ventas[0] : null;
        
        if (!venta) {
            return res.status(404).json({ success: false, error: 'Venta no encontrada' });
        }
        
        const items = (Array.isArray(detalles) ? detalles : []).map(d => ({
            id: d.ID,
            producto: d.Producto,
            cantidad: parseInt(d.Cantidad) || 1,
            precio: parseFloat(d.Precio) || 0,
            subtotal: parseFloat(d.SubTotal) || 0,
            descuento: parseFloat(d.Descuento) || 0,
            total: parseFloat(d.Total) || 0,
            estado: d.Status || 'Activo'
        }));
        
        const pagos = (Array.isArray(pagosTabla) ? pagosTabla : []).map(p => ({
            id: p.Id || p.ID,
            monto: parseFloat(p.Monto) || 0,
            moneda: p.Moneda || 'MXN',
            metodo: p.Metodo || 'Efectivo',
            tasa: parseFloat(p['Tasa de Cambio']) || 1,
            estado: p.Estado || 'Activo'
        }));

        res.json({ 
            success: true, 
            venta: {
                idVenta: venta.IdVenta || venta.ID,
                fecha: venta.Fecha || '',
                hora: venta.Hora || venta['Hora de Venta'] || '',
                cliente: venta.Cliente || 'Público General',
                vendedor: venta.Vendedor || '',
                sucursal: venta.Sucursal || '',
                estado: venta['Estado Venta'] || 'Completada',
                tipoDescuento: venta.TipoDescuento || '',
                observaciones: venta.Observaciones || ''
            },
            items,
            pagos
        });
    } catch (error) {
        console.error('Error detalle venta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CANCELAR VENTA COMPLETA
// ============================================
app.post('/api/ventas/:idVenta/cancelar', async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { motivo, usuario } = req.body;
        
        const [detalles, pagosTabla] = await Promise.all([
            appsheetRequest('Detalle Venta', 'Find', [], `Filter(Detalle Venta, [Ventas] = "${idVenta}")`),
            appsheetRequest('Pagos', 'Find', [], `Filter(Pagos, [Ventas] = "${idVenta}")`)
        ]);
        
        const itemsVenta = Array.isArray(detalles) ? detalles : [];
        const pagosVenta = Array.isArray(pagosTabla) ? pagosTabla : [];
        
        const motivoCompleto = `${motivo || 'Sin motivo'} - Por: ${usuario || 'Sistema'} - ${formatearFechaAppSheet()} ${formatearHoraAppSheet()}`;
        
        const promesas = [
            appsheetRequest('Ventas', 'Edit', [{
                IdVenta: idVenta,
                'Estado Venta': 'Cancelada',
                'Motivo Cancelacion': motivoCompleto
            }])
        ];
        
        for (const item of itemsVenta) {
            promesas.push(appsheetRequest('Detalle Venta', 'Edit', [{
                ID: item.ID,
                Status: 'Cancelado',
                'Motivo Cancelacion': motivo || 'Venta cancelada'
            }]));
        }
        
        for (const pago of pagosVenta) {
            promesas.push(appsheetRequest('Pagos', 'Edit', [{
                Id: pago.Id || pago.ID,
                Estado: 'Cancelado'
            }]));
        }
        
        await Promise.all(promesas);

        res.json({ 
            success: true, 
            mensaje: 'Venta cancelada',
            itemsCancelados: itemsVenta.length,
            pagosCancelados: pagosVenta.length
        });
    } catch (error) {
        console.error('Error cancelar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CANCELAR ITEM INDIVIDUAL
// ============================================
app.post('/api/ventas/:idVenta/cancelar-item', async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { itemId, motivo, usuario } = req.body;
        
        const detalles = await appsheetRequest('Detalle Venta', 'Find', [], `Filter(Detalle Venta, [Ventas] = "${idVenta}")`);
        
        const items = Array.isArray(detalles) ? detalles : [];
        const item = items.find(d => String(d.ID).trim() === String(itemId).trim());
        
        if (!item) {
            return res.status(404).json({ success: false, error: 'Item no encontrado' });
        }
        
        const itemsActivos = items.filter(d => 
            String(d.ID).trim() !== String(itemId).trim() &&
            (d.Status || 'Activo') !== 'Cancelado'
        );
        const nuevoTotal = itemsActivos.reduce((sum, d) => sum + (parseFloat(d.Total) || 0), 0);
        
        await Promise.all([
            appsheetRequest('Detalle Venta', 'Edit', [{
                ID: itemId,
                Status: 'Cancelado',
                'Motivo Cancelacion': `${motivo || 'Sin motivo'} - Por: ${usuario || 'Sistema'}`
            }]),
            appsheetRequest('Ventas', 'Edit', [{
                IdVenta: idVenta,
                'Total Venta': nuevoTotal
            }])
        ]);

        res.json({ 
            success: true, 
            mensaje: 'Item cancelado',
            itemCancelado: item.Producto,
            nuevoTotal
        });
    } catch (error) {
        console.error('Error cancelar item:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CATEGORIAS (CACHÉ)
// ============================================
app.get('/api/categorias', async (req, res) => {
    try {
        if (!CACHE.categorias.data) await cargarCategorias();
        res.json({ success: true, categorias: CACHE.categorias.data, fromCache: true });
    } catch (error) {
        console.error('Error categorias:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CONCEPTOS (CACHÉ)
// ============================================
app.get('/api/conceptos', async (req, res) => {
    try {
        if (!CACHE.conceptos.data) await cargarConceptos();
        const { categoria } = req.query;
        let conceptos = CACHE.conceptos.data;
        if (categoria) {
            conceptos = conceptos.filter(c => c.categoria.toLowerCase() === categoria.toLowerCase());
        }
        res.json({ success: true, conceptos, fromCache: true });
    } catch (error) {
        console.error('Error conceptos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// BANCOS (CACHÉ)
// ============================================
app.get('/api/bancos', async (req, res) => {
    try {
        if (!CACHE.bancos.data) await cargarBancos();
        res.json({ success: true, bancos: CACHE.bancos.data, fromCache: true });
    } catch (error) {
        console.error('Error bancos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// MOVIMIENTOS DE CAJA
// ============================================
app.post('/api/movimientos-caja', async (req, res) => {
    try {
        const { tipo, monto, origen, destino, notas, sucursal, categoria, concepto, usuario } = req.body;

        if (!tipo || !monto) {
            return res.status(400).json({ success: false, error: 'Tipo y monto requeridos' });
        }

        const ahora = new Date();
        const movimientoData = {
            'Tipo de Movimiento': tipo,
            'Fecha Movimiento': formatearFechaAppSheet(ahora),
            Usuario: usuario || '',
            Monto: parseFloat(monto) || 0,
            Origen: origen || '',
            Destino: destino || '',
            Notas: notas || '',
            Sucursal: sucursal || '',
            Categoria: categoria || '',
            Concepto: concepto || ''
        };

        const result = await appsheetRequest('Movimientos de Caja', 'Add', [movimientoData]);

        res.json({ success: true, mensaje: `${tipo} registrado exitosamente` });
    } catch (error) {
        console.error('Error movimiento caja:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/movimientos-caja/turno/:turnoId', async (req, res) => {
    try {
        const { turnoId } = req.params;
        const { sucursal, fecha } = req.query;
        
        let selector = `Filter(Movimientos de Caja, [Sucursal] = "${sucursal}")`;
        if (fecha) {
            selector = `Filter(Movimientos de Caja, AND([Sucursal] = "${sucursal}", [Fecha Movimiento] = "${fecha}"))`;
        }
        
        const movimientos = await appsheetRequest('Movimientos de Caja', 'Find', [], selector);
        
        const lista = (Array.isArray(movimientos) ? movimientos : []).map(m => ({
            id: m.ID,
            tipo: m['Tipo de Movimiento'] || '',
            fecha: m['Fecha Movimiento'] || '',
            monto: parseFloat(m.Monto) || 0,
            origen: m.Origen || '',
            destino: m.Destino || '',
            categoria: m.Categoria || '',
            concepto: m.Concepto || '',
            notas: m.Notas || '',
            usuario: m.Usuario || ''
        }));

        res.json({ success: true, movimientos: lista });
    } catch (error) {
        console.error('Error movimientos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK', 
        servicio: 'UMO POS API', 
        version: '1.3.0', 
        cors: 'enabled',
        cache: getCacheStatus()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, async () => {
    console.log(`🚀 UMO POS API v1.3.0 - Puerto ${PORT}`);
    
    try {
        await sincronizarTodo();
        console.log('✅ Caché cargado');
    } catch (error) {
        console.error('⚠️ Error caché inicial:', error.message);
    }
});
// ============================================
// CORTE DE TURNO - Agregar a server.js
// ============================================

// OBTENER DATOS PARA CORTE (sin cerrar)
app.get('/api/turnos/:turnoId/corte', async (req, res) => {
    try {
        const { turnoId } = req.params;
        const { sucursal, usuario, fecha } = req.query;

        // 1. Obtener turno
        const turnos = await appsheetRequest('AbrirTurno', 'Find', [], `Filter(AbrirTurno, [ID] = "${turnoId}")`);
        const turno = Array.isArray(turnos) && turnos.length > 0 ? turnos[0] : null;
        
        if (!turno) {
            return res.status(404).json({ success: false, error: 'Turno no encontrado' });
        }

        // Datos iniciales del turno
        const efectivoInicial = parseFloat(turno.Efectivo) || 0;
        const usdInicial = parseFloat(turno.USD) || 0;
        const cadInicial = parseFloat(turno.CAD) || 0;
        const eurInicial = parseFloat(turno.EUR) || 0;
        const tasaUSD = parseFloat(turno['USD a MXN']) || 17.5;
        const tasaCAD = parseFloat(turno['CAD a MXN']) || 13;
        const tasaEUR = parseFloat(turno['EUR a MXN']) || 19;

        // 2. Obtener ventas del turno
        const ventas = await appsheetRequest('Ventas', 'Find', [], `Filter(Ventas, [TurnoId] = "${turnoId}")`);
        const listaVentas = Array.isArray(ventas) ? ventas : [];

        // 3. Obtener IDs de ventas para buscar pagos
        const idsVentas = listaVentas.map(v => v.IdVenta);

        // 4. Obtener pagos de esas ventas
        let pagos = [];
        if (idsVentas.length > 0) {
            const allPagos = await appsheetRequest('Pagos', 'Find');
            pagos = (Array.isArray(allPagos) ? allPagos : [])
                .filter(p => idsVentas.includes(p.Ventas));
        }

        // 5. Obtener movimientos de caja del día/sucursal
        const fechaTurno = turno.Fecha || fecha;
        const sucursalTurno = turno.Sucursal || sucursal;
        const movimientos = await appsheetRequest('Movimientos de Caja', 'Find', [], 
            `Filter(Movimientos de Caja, AND([Sucursal] = "${sucursalTurno}", [Fecha Movimiento] = "${fechaTurno}"))`);
        const listaMovimientos = Array.isArray(movimientos) ? movimientos : [];

        // ============================================
        // CALCULAR VENTAS
        // ============================================
        let ventasBrutas = 0;
        let cancelaciones = 0;
        let ventasCerradas = 0;
        let ventasAbiertas = 0;
        let numVentas = 0;
        let numCanceladas = 0;

        listaVentas.forEach(v => {
            const total = parseFloat(v.Total) || 0;
            const estado = (v['Estado Venta'] || '').toLowerCase();

            if (estado === 'cancelada') {
                cancelaciones += total;
                numCanceladas++;
            } else {
                ventasBrutas += total;
                numVentas++;
                if (estado === 'cerrada') ventasCerradas += total;
                if (estado === 'abierta') ventasAbiertas += total;
            }
        });

        const ventasNetas = ventasBrutas;

        // ============================================
        // CALCULAR PAGOS POR MÉTODO Y MONEDA
        // ============================================
        const pagosPorMetodo = {
            efectivoMXN: 0,
            efectivoUSD: 0,
            efectivoCAD: 0,
            efectivoEUR: 0,
            bbvaNacional: 0,
            bbvaInternacional: 0,
            clipNacional: 0,
            clipInternacional: 0,
            transferencia: 0,
            otrosTarjeta: 0
        };

        let totalPagadoMXN = 0;
        let descuentosAplicados = 0;

        pagos.forEach(p => {
            const estado = (p.Estado || '').toLowerCase();
            if (estado === 'cancelado') return; // Ignorar pagos cancelados

            const monto = parseFloat(p.Monto) || 0;
            const moneda = (p.Moneda || 'MXN').toUpperCase();
            const metodo = (p.Metodo || '').toLowerCase();
            const tasa = parseFloat(p['Tasa de Cambio']) || 1;

            // Convertir a MXN
            let montoMXN = monto;
            if (moneda === 'USD') montoMXN = monto * tasa;
            else if (moneda === 'CAD') montoMXN = monto * tasa;
            else if (moneda === 'EUR') montoMXN = monto * tasa;

            totalPagadoMXN += montoMXN;

            // Clasificar por método
            if (metodo.includes('efectivo')) {
                if (moneda === 'MXN') pagosPorMetodo.efectivoMXN += monto;
                else if (moneda === 'USD') pagosPorMetodo.efectivoUSD += monto;
                else if (moneda === 'CAD') pagosPorMetodo.efectivoCAD += monto;
                else if (moneda === 'EUR') pagosPorMetodo.efectivoEUR += monto;
            } else if (metodo.includes('bbva') && metodo.includes('nacional')) {
                pagosPorMetodo.bbvaNacional += montoMXN;
            } else if (metodo.includes('bbva') && metodo.includes('internacional')) {
                pagosPorMetodo.bbvaInternacional += montoMXN;
            } else if (metodo.includes('clip') && metodo.includes('nacional')) {
                pagosPorMetodo.clipNacional += montoMXN;
            } else if (metodo.includes('clip') && metodo.includes('internacional')) {
                pagosPorMetodo.clipInternacional += montoMXN;
            } else if (metodo.includes('transferencia')) {
                pagosPorMetodo.transferencia += montoMXN;
            } else {
                pagosPorMetodo.otrosTarjeta += montoMXN;
            }
        });

        // Calcular descuentos desde detalle de venta
        if (idsVentas.length > 0) {
            const allDetalles = await appsheetRequest('Detalle Venta', 'Find');
            const detallesTurno = (Array.isArray(allDetalles) ? allDetalles : [])
                .filter(d => idsVentas.includes(d.Ventas) && (d.Status || '').toLowerCase() !== 'cancelado');
            
            detallesTurno.forEach(d => {
                descuentosAplicados += parseFloat(d.Descuento) || 0;
            });
        }

        // ============================================
        // CALCULAR MOVIMIENTOS DE CAJA
        // ============================================
        let entradas = 0;
        let salidas = 0;
        let gastos = 0;

        const detalleMovimientos = [];

        listaMovimientos.forEach(m => {
            const tipo = (m['Tipo de Movimiento'] || '').toLowerCase();
            const monto = parseFloat(m.Monto) || 0;

            detalleMovimientos.push({
                id: m.ID,
                tipo: m['Tipo de Movimiento'],
                monto,
                categoria: m.Categoria || '',
                concepto: m.Concepto || '',
                notas: m.Notas || ''
            });

            if (tipo.includes('ingreso') || tipo.includes('entrada')) {
                entradas += monto;
            } else if (tipo.includes('retiro') || tipo.includes('salida')) {
                salidas += monto;
            } else if (tipo.includes('gasto')) {
                gastos += monto;
            }
        });

        // ============================================
        // CONCILIACIÓN DE EFECTIVO
        // ============================================
        const efectivoVentas = pagosPorMetodo.efectivoMXN;
        const efectivoEsperado = efectivoInicial + efectivoVentas + entradas - salidas - gastos;
        const usdEsperado = usdInicial + pagosPorMetodo.efectivoUSD;
        const cadEsperado = cadInicial + pagosPorMetodo.efectivoCAD;
        const eurEsperado = eurInicial + pagosPorMetodo.efectivoEUR;

        // ============================================
        // RESPUESTA
        // ============================================
        res.json({
            success: true,
            turno: {
                id: turnoId,
                fecha: turno.Fecha,
                horaApertura: turno['Hora Apertura'],
                usuario: turno.Usuario,
                sucursal: turno.Sucursal,
                estado: turno.Estado
            },
            inicioCaja: {
                efectivo: efectivoInicial,
                usd: usdInicial,
                cad: cadInicial,
                eur: eurInicial,
                tasaUSD,
                tasaCAD,
                tasaEUR
            },
            ventas: {
                brutas: ventasBrutas,
                descuentos: descuentosAplicados,
                cancelaciones,
                netas: ventasNetas,
                numVentas,
                numCanceladas,
                ticketPromedio: numVentas > 0 ? ventasNetas / numVentas : 0
            },
            pagos: {
                efectivoMXN: pagosPorMetodo.efectivoMXN,
                efectivoUSD: pagosPorMetodo.efectivoUSD,
                efectivoCAD: pagosPorMetodo.efectivoCAD,
                efectivoEUR: pagosPorMetodo.efectivoEUR,
                bbvaNacional: pagosPorMetodo.bbvaNacional,
                bbvaInternacional: pagosPorMetodo.bbvaInternacional,
                clipNacional: pagosPorMetodo.clipNacional,
                clipInternacional: pagosPorMetodo.clipInternacional,
                transferencia: pagosPorMetodo.transferencia,
                otros: pagosPorMetodo.otrosTarjeta,
                totalMXN: totalPagadoMXN
            },
            movimientos: {
                entradas,
                salidas,
                gastos,
                neto: entradas - salidas - gastos,
                detalle: detalleMovimientos
            },
            esperado: {
                efectivoMXN: efectivoEsperado,
                usd: usdEsperado,
                cad: cadEsperado,
                eur: eurEsperado
            },
            detalleVentas: listaVentas.map(v => ({
                id: v.IdVenta,
                cliente: v.Cliente,
                total: parseFloat(v.Total) || 0,
                estado: v['Estado Venta'],
                descuento: v.TipoDescuento
            }))
        });

    } catch (error) {
        console.error('Error corte:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GUARDAR CORTE Y CERRAR TURNO
app.post('/api/turnos/:turnoId/cerrar-corte', async (req, res) => {
    try {
        const { turnoId } = req.params;
        const { 
            // Conteo físico
            monedas1, monedas2, monedas5, monedas10, monedas20,
            billetes20, billetes50, billetes100, billetes200, billetes500, billetes1000,
            conteoUSD, conteoCAD, conteoEUR,
            // Tarjetas
            bbvaNacional, bbvaInternacional, clipNacional, clipInternacional, transferencia,
            // Observaciones
            observaciones,
            // Datos calculados (del frontend)
            ventasBrutas, descuentos, cancelaciones, ventasNetas,
            efectivoEsperado, usdEsperado, cadEsperado, eurEsperado,
            numVentas, ticketPromedio,
            entradas, salidas, gastos,
            // Validación admin
            usuarioAutoriza, pinAutoriza
        } = req.body;

        // Validar autorización si hay diferencias (opcional)
        if (usuarioAutoriza && pinAutoriza) {
            if (!CACHE.usuarios.data) await cargarUsuarios();
            const admin = CACHE.usuarios.data.find(u => 
                String(u['ID Empleado']).trim() === String(usuarioAutoriza).trim() &&
                String(u['Pin de Acceso a Sistema']).trim() === String(pinAutoriza).trim()
            );
            
            if (!admin) {
                return res.status(401).json({ success: false, error: 'PIN de autorización incorrecto' });
            }
            
            const rol = (admin.Puesto || '').toLowerCase();
            if (!rol.includes('admin') && !rol.includes('gerente') && !rol.includes('super')) {
                return res.status(403).json({ success: false, error: 'Usuario no tiene permisos para autorizar' });
            }
        }

        // Calcular total MXN contado
        const totalMXN = 
            (parseFloat(monedas1) || 0) * 1 +
            (parseFloat(monedas2) || 0) * 2 +
            (parseFloat(monedas5) || 0) * 5 +
            (parseFloat(monedas10) || 0) * 10 +
            (parseFloat(monedas20) || 0) * 20 +
            (parseFloat(billetes20) || 0) * 20 +
            (parseFloat(billetes50) || 0) * 50 +
            (parseFloat(billetes100) || 0) * 100 +
            (parseFloat(billetes200) || 0) * 200 +
            (parseFloat(billetes500) || 0) * 500 +
            (parseFloat(billetes1000) || 0) * 1000;

        // Calcular diferencias
        const difEfectivo = totalMXN - (parseFloat(efectivoEsperado) || 0);
        const difUSD = (parseFloat(conteoUSD) || 0) - (parseFloat(usdEsperado) || 0);
        const difCAD = (parseFloat(conteoCAD) || 0) - (parseFloat(cadEsperado) || 0);
        const difEUR = (parseFloat(conteoEUR) || 0) - (parseFloat(eurEsperado) || 0);

        // Actualizar turno en AppSheet
        const updateData = {
            ID: turnoId,
            'Hora de Cierre': formatearHoraAppSheet(),
            Estado: 'Cerrado',
            // Conteo monedas
            'Monedas de $1 MXN': parseFloat(monedas1) || 0,
            'Monedas de $2 MXN': parseFloat(monedas2) || 0,
            'Monedas de $5 MXN': parseFloat(monedas5) || 0,
            'Monedas de $10 MXN': parseFloat(monedas10) || 0,
            'Monedas de $20 MXN': parseFloat(monedas20) || 0,
            // Conteo billetes
            'Billetes de $20 MXN': parseFloat(billetes20) || 0,
            'Billetes de $50 MXN': parseFloat(billetes50) || 0,
            'Billetes de $100 MXN': parseFloat(billetes100) || 0,
            'Billetes de $200 MXN': parseFloat(billetes200) || 0,
            'Billetes de $500 MXN': parseFloat(billetes500) || 0,
            'Billetes de $1000 MXN': parseFloat(billetes1000) || 0,
            'Total MXN (Calculado)': totalMXN,
            // Otras monedas
            '💵 USD': parseFloat(conteoUSD) || 0,
            '🍁 CAD': parseFloat(conteoCAD) || 0,
            '🇪🇺 EUR': parseFloat(conteoEUR) || 0,
            // Tarjetas
            'BBVA Nacional': parseFloat(bbvaNacional) || 0,
            'BBVA Internacional': parseFloat(bbvaInternacional) || 0,
            'Clip Nacional': parseFloat(clipNacional) || 0,
            'Clip Internacional': parseFloat(clipInternacional) || 0,
            'Transferencia electrónica de fondos': parseFloat(transferencia) || 0,
            // Ventas
            'Ventas Brutas': parseFloat(ventasBrutas) || 0,
            'Descuentos Aplicados': parseFloat(descuentos) || 0,
            'Cancelaciones': parseFloat(cancelaciones) || 0,
            'Ventas Netas': parseFloat(ventasNetas) || 0,
            // Movimientos
            'Entradas': parseFloat(entradas) || 0,
            'Salidas': parseFloat(salidas) || 0,
            'Gastos': parseFloat(gastos) || 0,
            // Esperado
            'Efectivo esperado en caja': parseFloat(efectivoEsperado) || 0,
            'USD Esperado': parseFloat(usdEsperado) || 0,
            'CAD Esperado': parseFloat(cadEsperado) || 0,
            'EUR Esperado': parseFloat(eurEsperado) || 0,
            // Diferencias
            'Diferencia Efectivo': difEfectivo,
            'Diferencia USD': difUSD,
            'Diferencia CAD': difCAD,
            'Diferencia EUR': difEUR,
            // Stats
            'Número de ventas': parseInt(numVentas) || 0,
            'Ticket Promedio': parseFloat(ticketPromedio) || 0,
            // Observaciones
            'Observaciones': observaciones || ''
        };

        await appsheetRequest('AbrirTurno', 'Edit', [updateData]);

        res.json({
            success: true,
            mensaje: 'Corte guardado y turno cerrado',
            resumen: {
                totalContado: totalMXN,
                esperado: parseFloat(efectivoEsperado) || 0,
                diferencia: difEfectivo,
                usdContado: parseFloat(conteoUSD) || 0,
                usdEsperado: parseFloat(usdEsperado) || 0,
                difUSD,
                cadContado: parseFloat(conteoCAD) || 0,
                cadEsperado: parseFloat(cadEsperado) || 0,
                difCAD,
                eurContado: parseFloat(conteoEUR) || 0,
                eurEsperado: parseFloat(eurEsperado) || 0,
                difEUR
            }
        });

    } catch (error) {
        console.error('Error cerrar corte:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// RECALCULAR CORTE (requiere admin)
app.post('/api/turnos/:turnoId/recalcular', async (req, res) => {
    try {
        const { turnoId } = req.params;
        const { usuarioId, pin } = req.body;

        // Validar admin
        if (!CACHE.usuarios.data) await cargarUsuarios();
        const admin = CACHE.usuarios.data.find(u => 
            String(u['ID Empleado']).trim() === String(usuarioId).trim() &&
            String(u['Pin de Acceso a Sistema']).trim() === String(pin).trim()
        );
        
        if (!admin) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
        }
        
        const rol = (admin.Puesto || '').toLowerCase();
        if (!rol.includes('admin') && !rol.includes('gerente') && !rol.includes('super')) {
            return res.status(403).json({ success: false, error: 'Solo Admin, Gerente o Super Admin pueden recalcular' });
        }

        // Reabrir turno para recalcular
        await appsheetRequest('AbrirTurno', 'Edit', [{
            ID: turnoId,
            Estado: 'Abierto',
            'Hora de Cierre': ''
        }]);

        res.json({ 
            success: true, 
            mensaje: 'Turno reabierto para recalcular',
            autorizadoPor: admin.Nombre
        });

    } catch (error) {
        console.error('Error recalcular:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
