const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración AppSheet
const APP_ID = '317b1c5c-33b0-4c4b-b3f6-40c925e05237';
const ACCESS_KEY = 'V2-htkz3-r0477-0iLrM-Jhq7C-2uehz-liV0b-sVTAT-n23hT';
const API_BASE = 'https://www.appsheet.com/api/v2/apps';

app.use(cors({
    origin: [
        'https://diegoleonuniline.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// ============================================
// UTILIDADES
// ============================================
async function appsheetRequest(tabla, action, rows = []) {
    const url = `${API_BASE}/${APP_ID}/tables/${encodeURIComponent(tabla)}/Action?applicationAccessKey=${ACCESS_KEY}`;
    
    const payload = {
        Action: action,
        Properties: { Locale: 'es-MX', Timezone: 'America/Mexico_City' },
        Rows: rows
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`AppSheet Error: ${error}`);
    }

    return response.json();
}

// ============================================
// RUTAS - TURNOS
// ============================================

// Verificar turno activo
app.get('/api/turnos/activo/:usuario/:sucursal', async (req, res) => {
    try {
        const { usuario, sucursal } = req.params;
        const turnos = await appsheetRequest('Turnos', 'Find');
        
        const turnoActivo = turnos.find(t => 
            t.Usuario === usuario && 
            t.Sucursal === sucursal && 
            t.Estado === 'Abierto'
        );

        res.json({ 
            success: true, 
            turnoActivo: turnoActivo || null 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Abrir turno
app.post('/api/turnos/abrir', async (req, res) => {
    try {
        const { 
            usuario, 
            sucursal, 
            efectivoInicial,
            usdInicial,
            cadInicial,
            eurInicial,
            tasaUSD,
            tasaCAD,
            tasaEUR
        } = req.body;

        const ahora = new Date();
        const fecha = ahora.toLocaleDateString('es-MX');
        const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const id = `TRN-${Date.now()}`;

        const turnoData = {
            ID: id,
            Fecha: fecha,
            'Hora Apertura': hora,
            Usuario: usuario,
            Sucursal: sucursal,
            Estado: 'Abierto',
            Efectivo: parseFloat(efectivoInicial) || 0,
            USD: parseFloat(usdInicial) || 0,
            CAD: parseFloat(cadInicial) || 0,
            EUR: parseFloat(eurInicial) || 0,
            'USD a MXN': parseFloat(tasaUSD) || 17.5,
            'CAD a MXN': parseFloat(tasaCAD) || 13,
            'EUR a MXN': parseFloat(tasaEUR) || 19,
            'Monedas de $1 MXN': 0,
            'Monedas de $2 MXN': 0,
            'Monedas de $5 MXN': 0,
            'Monedas de $10 MXN': 0,
            'Monedas de $20 MXN': 0,
            'Billetes de $20 MXN': 0,
            'Billetes de $50 MXN': 0,
            'Billetes de $100 MXN': 0,
            'Billetes de $200 MXN': 0,
            'Billetes de $500 MXN': 0,
            'Billetes de $1000 MXN': 0,
            '💵 USD': 0,
            '🍁 CAD': 0,
            '🇪🇺 EUR': 0,
            'BBVA Nacional': 0,
            'BBVA Internacional': 0,
            'Clip Nacional': 0,
            'Clip Internacional': 0,
            'Transferencia electrónica de fondos': 0
        };

        await appsheetRequest('Turnos', 'Add', [turnoData]);

        res.json({ 
            success: true, 
            turnoId: id,
            mensaje: 'Turno abierto exitosamente'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cerrar turno
app.post('/api/turnos/cerrar', async (req, res) => {
    try {
        const { 
            turnoId,
            // Conteo MXN
            monedas1, monedas2, monedas5, monedas10, monedas20,
            billetes20, billetes50, billetes100, billetes200, billetes500, billetes1000,
            // Conteo otras monedas
            conteoUSD, conteoCAD, conteoEUR,
            // Transferencias
            bbvaNacional, bbvaInternacional,
            clipNacional, clipInternacional,
            transferencia,
            // Observaciones
            observaciones
        } = req.body;

        const ahora = new Date();
        const horaCierre = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

        // Calcular total MXN
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

        const updateData = {
            ID: turnoId,
            'Hora de Cierre': horaCierre,
            Estado: 'Cerrado',
            // Monedas MXN
            'Monedas de $1 MXN': parseFloat(monedas1) || 0,
            'Monedas de $2 MXN': parseFloat(monedas2) || 0,
            'Monedas de $5 MXN': parseFloat(monedas5) || 0,
            'Monedas de $10 MXN': parseFloat(monedas10) || 0,
            'Monedas de $20 MXN': parseFloat(monedas20) || 0,
            // Billetes MXN
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
            // Transferencias
            'BBVA Nacional': parseFloat(bbvaNacional) || 0,
            'BBVA Internacional': parseFloat(bbvaInternacional) || 0,
            'Clip Nacional': parseFloat(clipNacional) || 0,
            'Clip Internacional': parseFloat(clipInternacional) || 0,
            'Transferencia electrónica de fondos': parseFloat(transferencia) || 0,
            // Observaciones
            Observaciones: observaciones || ''
        };

        await appsheetRequest('Turnos', 'Edit', [updateData]);

        res.json({ 
            success: true, 
            totalMXN,
            mensaje: 'Turno cerrado exitosamente'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - PRODUCTOS
// ============================================
app.get('/api/productos', async (req, res) => {
    try {
        const productos = await appsheetRequest('Productos', 'Find');
        
        const productosFormateados = productos
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

        res.json({ success: true, productos: productosFormateados });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - CLIENTES
// ============================================
app.get('/api/clientes', async (req, res) => {
    try {
        const clientes = await appsheetRequest('Clientes', 'Find');
        
        const clientesFormateados = clientes.map(c => ({
            codigo: c['Codigo'] || c['CODIGO'] || c['Id'] || '',
            nombre: c['Nombre'] || c['NOMBRE'] || 'Sin nombre',
            correo: c['Correo'] || c['CORREO'] || '',
            telefono: c['Telefono'] || c['TELEFONO'] || '',
            grupo: c['Grupo'] || c['GRUPO'] || ''
        }));

        res.json({ success: true, clientes: clientesFormateados });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clientes', async (req, res) => {
    try {
        const { codigo, nombre, correo, telefono } = req.body;
        
        if (!nombre) {
            return res.status(400).json({ success: false, error: 'Nombre requerido' });
        }

        const clienteData = {
            Codigo: codigo || `CLI-${Date.now()}`,
            Nombre: nombre,
            Correo: correo || '',
            Telefono: telefono || ''
        };

        await appsheetRequest('Clientes', 'Add', [clienteData]);

        res.json({ success: true, codigo: clienteData.Codigo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - MÉTODOS DE PAGO
// ============================================
app.get('/api/metodos-pago', async (req, res) => {
    try {
        const metodos = await appsheetRequest('Metodos de pago', 'Find');
        
        const lista = metodos.map(m => m.Nombre || m.NOMBRE || 'Sin nombre');

        res.json({ success: true, metodos: lista.length > 0 ? lista : ['Efectivo', 'Tarjeta', 'Transferencia'] });
    } catch (error) {
        res.json({ success: true, metodos: ['Efectivo', 'Tarjeta', 'Transferencia'] });
    }
});

// ============================================
// RUTAS - DESCUENTOS
// ============================================
app.get('/api/descuentos', async (req, res) => {
    try {
        const descuentos = await appsheetRequest('Tabla Descuentos', 'Find');
        
        const descuentosFormateados = descuentos.map(d => ({
            id: d.Id || d.ID || '',
            nombre: d.Nombre || '',
            grupo: d.Grupo || '',
            metodoPago: d['Metodo de Pago'] || d['Método de Pago'] || '',
            porcentaje: parseFloat(String(d.Porcentaje || '0').replace('%', '')) || 0
        }));

        res.json({ success: true, descuentos: descuentosFormateados });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - VENTAS
// ============================================
app.post('/api/ventas', async (req, res) => {
    try {
        const { venta, detalles, pagos } = req.body;

        // Registrar venta
        const ventaData = {
            IdVenta: venta.IdVenta,
            Sucursal: venta.Sucursal,
            Vendedor: venta.Vendedor,
            Cliente: venta.Cliente,
            TipoDescuento: venta.TipoDescuento || 'Ninguno',
            Observaciones: venta.Observaciones || '',
            'Descuento Extra': parseFloat(venta.DescuentoExtra) || 0,
            'Agregado por': venta.Vendedor,
            TurnoId: venta.TurnoId || ''
        };

        await appsheetRequest('Ventas', 'Add', [ventaData]);

        // Registrar detalles
        if (detalles && detalles.length > 0) {
            const detallesData = detalles.map(d => ({
                ID: d.ID,
                Ventas: venta.IdVenta,
                Producto: d.Producto,
                Cantidad: d.Cantidad,
                Precio: d.Precio,
                SubTotal: d.SubTotal,
                Descuento: d.Descuento,
                Total: d.Total
            }));
            await appsheetRequest('Detalle Venta', 'Add', detallesData);
        }

        // Registrar pagos
        if (pagos && pagos.length > 0) {
            const pagosData = pagos.map(p => ({
                Id: p.Id,
                Ventas: venta.IdVenta,
                Monto: p.Monto,
                Moneda: p.Moneda,
                Metodo: p.Metodo,
                'Tasa de Cambio': p.TasaCambio || 1,
                SucursaldeRegistro: venta.Sucursal,
                'Grupo Cliente': venta.GrupoCliente || '',
                Cliente: venta.Cliente,
                Vendedor: venta.Vendedor,
                Estado: 'Cerrado'
            }));
            await appsheetRequest('Pagos', 'Add', pagosData);
        }

        res.json({ 
            success: true, 
            ventaId: venta.IdVenta,
            mensaje: 'Venta registrada exitosamente'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - PROMOCIONES
// ============================================
app.get('/api/promociones', async (req, res) => {
    try {
        const promociones = await appsheetRequest('Promociones', 'Find');
        
        const promoActivas = promociones
            .filter(p => p.Estado === 'Activa')
            .map(p => ({
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

        res.json({ success: true, promociones: promoActivas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================
// RUTAS - AUTENTICACIÓN
// ============================================
app.post('/api/login', async (req, res) => {
    try {
        const { empleadoId, pin } = req.body;
        
        if (!empleadoId || !pin) {
            return res.status(400).json({ 
                success: false, 
                error: 'ID de empleado y PIN son requeridos' 
            });
        }

        const usuarios = await appsheetRequest('Usuarios', 'Find');
        
        const usuario = usuarios.find(u => 
            String(u['ID Empleado']).trim() === String(empleadoId).trim() && 
            String(u['Pin de Acceso a Sistema']).trim() === String(pin).trim()
        );

        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                error: 'Credenciales incorrectas' 
            });
        }

        res.json({ 
            success: true, 
            usuario: {
                id: usuario['ID Empleado'],
                nombre: usuario['Nombre'] || usuario['NOMBRE'] || 'Usuario',
                sucursal: usuario['Sucursal'] || usuario['SUCURSAL'] || 'Principal',
                rol: usuario['Rol'] || usuario['ROL'] || 'Vendedor'
            }
        });
    } catch (error) {
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
        version: '1.0.0'
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 UMO POS API corriendo en puerto ${PORT}`);
});
