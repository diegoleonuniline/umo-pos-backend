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
// CORS - CONFIGURACIÓN COMPLETA
// ============================================
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedOrigins = [
            'https://diegoleonuniline.github.io',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:8080'
        ];
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.github.io')) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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

async function appsheetRequest(tabla, action, rows = []) {
    const url = `${API_BASE}/${APP_ID}/tables/${encodeURIComponent(tabla)}/Action?applicationAccessKey=${ACCESS_KEY}`;
    
    const payload = {
        Action: action,
        Properties: { Locale: 'es-MX', Timezone: 'America/Mexico_City' },
        Rows: rows
    };

    console.log(`AppSheet Request [${tabla}][${action}]:`, JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log(`AppSheet Response [${tabla}]:`, responseText);

    if (!response.ok) {
        throw new Error(`AppSheet Error: ${responseText}`);
    }

    if (!responseText || responseText.trim() === '') {
        return { success: true };
    }

    try {
        return JSON.parse(responseText);
    } catch (e) {
        return { success: true, raw: responseText };
    }
}

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
                nombreCompleto: usuario['Nombre Completo'] || `${usuario['Nombre']} ${usuario['Apellido Paterno']} ${usuario['Apellido Materno']}`.trim(),
                sucursal: usuario['Sucursal'] || usuario['SUCURSAL'] || 'Principal',
                rol: usuario['Puesto'] || usuario['Rol'] || 'Vendedor'
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - TURNOS
// ============================================
app.get('/api/turnos/activo/:usuario/:sucursal', async (req, res) => {
    try {
        const { usuario, sucursal } = req.params;
        
        console.log('=== BUSCANDO TURNO ===');
        console.log('Frontend envía - usuario:', usuario, 'sucursal:', sucursal);
        
        // Paso 1: Obtener nombre del usuario desde tabla Usuarios
        let nombreUsuario = null;
        try {
            const usuarios = await appsheetRequest('Usuarios', 'Find');
            const usuarioEncontrado = usuarios.find(u => 
                String(u['ID Empleado']).trim() === String(usuario).trim()
            );
            if (usuarioEncontrado) {
                nombreUsuario = usuarioEncontrado['Nombre'];
                console.log('✅ Nombre para ID', usuario, '=', nombreUsuario);
            }
        } catch (e) {
            console.log('Error obteniendo usuario:', e.message);
        }
        
        // Paso 2: Buscar turno
        const turnos = await appsheetRequest('AbrirTurno', 'Find');
        console.log('Turnos en tabla:', Array.isArray(turnos) ? turnos.length : 0);
        
        if (!Array.isArray(turnos) || turnos.length === 0) {
            return res.json({ success: true, turnoActivo: null });
        }
        
        const turnoActivo = turnos.find(t => {
            const tEstado = String(t.Estado || '').trim().toLowerCase();
            if (tEstado !== 'abierto') return false;
            
            const tSucursal = String(t.Sucursal || '').trim().toLowerCase();
            if (tSucursal !== sucursal.toLowerCase()) return false;
            
            const tUsuario = String(t.Usuario || '').trim().toLowerCase();
            
            console.log('Comparando turno - Usuario:', tUsuario, 'Sucursal:', tSucursal);
            
            // Coincidir por ID directo
            if (tUsuario === usuario.toLowerCase()) {
                console.log('  → Match por ID');
                return true;
            }
            
            // Coincidir por nombre
            if (nombreUsuario && tUsuario === nombreUsuario.toLowerCase()) {
                console.log('  → Match por NOMBRE');
                return true;
            }
            
            return false;
        });

        console.log('=== RESULTADO ===');
        if (turnoActivo) {
            console.log('✅ Turno encontrado:', turnoActivo.ID);
        } else {
            console.log('❌ Sin turno activo');
        }

        res.json({ 
            success: true, 
            turnoActivo: turnoActivo || null 
        });
    } catch (error) {
        console.error('Error verificando turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/turnos/abrir', async (req, res) => {
    try {
        const { 
            usuario,
            empleadoId,
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
        const fecha = formatearFechaAppSheet(ahora);
        const hora = formatearHoraAppSheet(ahora);

        const turnoData = {
            Fecha: fecha,
            'Hora Apertura': hora,
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

        console.log('Abriendo turno:', turnoData);

        const result = await appsheetRequest('AbrirTurno', 'Add', [turnoData]);
        
        let turnoId = 'TRN-' + Date.now();
        if (result && result.Rows && result.Rows[0] && result.Rows[0].ID) {
            turnoId = result.Rows[0].ID;
        }

        res.json({ 
            success: true, 
            turnoId: turnoId,
            mensaje: 'Turno abierto exitosamente'
        });
    } catch (error) {
        console.error('Error abriendo turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/turnos/cerrar', async (req, res) => {
    try {
        const { 
            turnoId,
            monedas1, monedas2, monedas5, monedas10, monedas20,
            billetes20, billetes50, billetes100, billetes200, billetes500, billetes1000,
            conteoUSD, conteoCAD, conteoEUR,
            bbvaNacional, bbvaInternacional,
            clipNacional, clipInternacional,
            transferencia,
            observaciones
        } = req.body;

        const ahora = new Date();
        const horaCierre = formatearHoraAppSheet(ahora);

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

        res.json({ 
            success: true, 
            totalMXN,
            mensaje: 'Turno cerrado exitosamente'
        });
    } catch (error) {
        console.error('Error cerrando turno:', error);
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
        console.error('Error obteniendo productos:', error);
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
        console.error('Error obteniendo clientes:', error);
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
        console.error('Error agregando cliente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - MÉTODOS DE PAGO
// ============================================
app.get('/api/metodos-pago', async (req, res) => {
    try {
        const metodos = await appsheetRequest('Metodos de pago', 'Find');
        const lista = metodos.map(m => m['Metodo de pago'] || m['Método de pago'] || m['METODO DE PAGO'] || 'Sin nombre');
        res.json({ success: true, metodos: lista.length > 0 ? lista : ['Efectivo', 'Tarjeta', 'Transferencia'] });
    } catch (error) {
        console.error('Error obteniendo métodos de pago:', error);
        res.json({ success: true, metodos: ['Efectivo', 'Tarjeta', 'Transferencia'] });
    }
});

// ============================================
// RUTAS - DESCUENTOS
// ============================================
app.get('/api/descuentos', async (req, res) => {
    try {
        const descuentos = await appsheetRequest('Tabla Descuentos', 'Find');
        
        const descuentosFormateados = descuentos.map((d, i) => {
            const id = d.Id || d.ID || `DES-${i+1}`;
            const nombre = d.Nombre || d.NOMBRE || '';
            const grupo = d.Grupo || d.GRUPO || '';
            const metodoPago = d['Metodo de Pago'] || d['Método de Pago'] || d['METODO DE PAGO'] || '';
            
            let porcentaje = 0;
            const rawPct = d.Porcentaje || d['%'] || d.PCT || 0;
            if (rawPct) {
                let s = String(rawPct).replace('%', '').replace(',', '.').trim();
                porcentaje = parseFloat(s) || 0;
                if (porcentaje > 0 && porcentaje <= 1) {
                    porcentaje = porcentaje * 100;
                }
            }
            
            let etiqueta = '';
            if (grupo && metodoPago) {
                etiqueta = `${grupo} + ${metodoPago} (${porcentaje}%)`;
            } else if (grupo) {
                etiqueta = `Grupo: ${grupo} (${porcentaje}%)`;
            } else if (metodoPago) {
                etiqueta = `Método: ${metodoPago} (${porcentaje}%)`;
            } else {
                etiqueta = `${nombre || 'Descuento'} (${porcentaje}%)`;
            }

            return {
                id: String(id).trim(),
                nombre: String(nombre).trim(),
                grupo: String(grupo).trim(),
                metodoPago: String(metodoPago).trim(),
                porcentaje: porcentaje,
                etiqueta: etiqueta
            };
        });

        res.json({ success: true, descuentos: descuentosFormateados });
    } catch (error) {
        console.error('Error obteniendo descuentos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CALCULAR DESCUENTO AUTOMÁTICO
// ============================================
app.post('/api/descuentos/calcular', async (req, res) => {
    try {
        const { grupoCliente, metodoPago } = req.body;
        
        const descuentos = await appsheetRequest('Tabla Descuentos', 'Find');
        
        if (!descuentos || descuentos.length === 0) {
            return res.json({ 
                success: true, 
                porcentaje: 0, 
                descripcion: 'Sin descuento', 
                id: null 
            });
        }
        
        const grupoNorm = (grupoCliente || '').toLowerCase().trim();
        const metodoNorm = (metodoPago || '').toLowerCase().trim();
        
        const descuentosParsed = descuentos.map(d => {
            const grupo = String(d.Grupo || d.GRUPO || '').trim();
            const metodo = String(d['Metodo de Pago'] || d['Método de Pago'] || d['METODO DE PAGO'] || '').trim();
            let porcentaje = 0;
            const rawPct = d.Porcentaje || d['%'] || d.PCT || 0;
            if (rawPct) {
                let s = String(rawPct).replace('%', '').replace(',', '.').trim();
                porcentaje = parseFloat(s) || 0;
                if (porcentaje > 0 && porcentaje <= 1) {
                    porcentaje = porcentaje * 100;
                }
            }
            return {
                id: d.Id || d.ID || '',
                grupo: grupo,
                metodoPago: metodo,
                porcentaje: porcentaje
            };
        });
        
        for (let d of descuentosParsed) {
            const grupoDesc = d.grupo.toLowerCase();
            const metodoDesc = d.metodoPago.toLowerCase();
            
            if (grupoDesc && metodoDesc && grupoDesc === grupoNorm && metodoDesc === metodoNorm) {
                return res.json({
                    success: true,
                    porcentaje: d.porcentaje,
                    descripcion: `${d.grupo} + ${d.metodoPago}`,
                    id: d.id
                });
            }
        }
        
        for (let d of descuentosParsed) {
            const grupoDesc = d.grupo.toLowerCase();
            const metodoDesc = d.metodoPago;
            
            if (grupoDesc && !metodoDesc && grupoDesc === grupoNorm) {
                return res.json({
                    success: true,
                    porcentaje: d.porcentaje,
                    descripcion: `Grupo: ${d.grupo}`,
                    id: d.id
                });
            }
        }
        
        for (let d of descuentosParsed) {
            const grupoDesc = d.grupo;
            const metodoDesc = d.metodoPago.toLowerCase();
            
            if (!grupoDesc && metodoDesc && metodoDesc === metodoNorm) {
                return res.json({
                    success: true,
                    porcentaje: d.porcentaje,
                    descripcion: `Método: ${d.metodoPago}`,
                    id: d.id
                });
            }
        }
        
        res.json({ 
            success: true, 
            porcentaje: 0, 
            descripcion: 'Sin descuento', 
            id: null 
        });
        
    } catch (error) {
        console.error('Error calculando descuento:', error);
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
        console.error('Error obteniendo promociones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS - VENTAS
// ============================================
app.post('/api/ventas', async (req, res) => {
    try {
        const { venta, detalles, pagos } = req.body;

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

        if (pagos && pagos.length > 0) {
            const pagosData = pagos.map(p => ({
                Id: p.Id,
                Ventas: venta.IdVenta,
                Monto: p.Monto,
                Moneda: p.Moneda,
                Metodo: p.Metodo,
                'Tasa de Cambio': p['Tasa de Cambio'] || 1,
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
        console.error('Error registrando venta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// ============================================
// RUTAS - VENTAS DEL TURNO
// ============================================

// Obtener ventas de un turno
app.get('/api/ventas/turno/:turnoId', async (req, res) => {
    try {
        const { turnoId } = req.params;
        
        const ventas = await appsheetRequest('Ventas', 'Find');
        
        const ventasTurno = ventas
            .filter(v => String(v.TurnoId || '').trim() === String(turnoId).trim())
            .map(v => ({
                idVenta: v.IdVenta || v.ID,
                fecha: v.Fecha || '',
                hora: v.Hora || v['Hora de Venta'] || '',
                cliente: v.Cliente || 'Público General',
                vendedor: v.Vendedor || '',
                total: parseFloat(v.Total || v['Total Venta'] || 0),
                estado: v['Estado Venta'] || 'Completada',
                descuento: v.TipoDescuento || ''
            }))
            .sort((a, b) => b.idVenta.localeCompare(a.idVenta));

        res.json({ success: true, ventas: ventasTurno });
    } catch (error) {
        console.error('Error obteniendo ventas del turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener detalle de una venta (productos + pagos)
app.get('/api/ventas/:idVenta/detalle', async (req, res) => {
    try {
        const { idVenta } = req.params;
        
        // Obtener venta principal
        const ventas = await appsheetRequest('Ventas', 'Find');
        const venta = ventas.find(v => 
            String(v.IdVenta || v.ID).trim() === String(idVenta).trim()
        );
        
        if (!venta) {
            return res.status(404).json({ success: false, error: 'Venta no encontrada' });
        }
        
        // Obtener detalles (productos)
        const detalles = await appsheetRequest('Detalle Venta', 'Find');
        const items = detalles
            .filter(d => String(d.Ventas || '').trim() === String(idVenta).trim())
            .map(d => ({
                id: d.ID,
                producto: d.Producto,
                cantidad: parseInt(d.Cantidad) || 1,
                precio: parseFloat(d.Precio) || 0,
                subtotal: parseFloat(d.SubTotal) || 0,
                descuento: parseFloat(d.Descuento) || 0,
                total: parseFloat(d.Total) || 0,
                estado: d.Estado || 'Activo'
            }));
        
        // Obtener pagos
        const pagosTabla = await appsheetRequest('Pagos', 'Find');
        const pagos = pagosTabla
            .filter(p => String(p.Ventas || '').trim() === String(idVenta).trim())
            .map(p => ({
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
                hora: venta.Hora || '',
                cliente: venta.Cliente || 'Público General',
                vendedor: venta.Vendedor || '',
                sucursal: venta.Sucursal || '',
                estado: venta.Estado || 'Completada',
                tipoDescuento: venta.TipoDescuento || '',
                observaciones: venta.Observaciones || ''
            },
            items,
            pagos
        });
    } catch (error) {
        console.error('Error obteniendo detalle de venta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancelar venta completa
app.post('/api/ventas/:idVenta/cancelar', async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { motivo, usuario } = req.body;
        
        // Actualizar estado de la venta
        await appsheetRequest('Ventas', 'Edit', [{
            IdVenta: idVenta,
            'Estado Venta': 'Cancelada',
            'Motivo Cancelacion': `${motivo || 'Sin motivo'} - Por: ${usuario || 'Sistema'} - ${formatearFechaAppSheet()} ${formatearHoraAppSheet()}`
        }]);
        
        // Cancelar todos los items
        const detalles = await appsheetRequest('Detalle Venta', 'Find');
        const itemsVenta = detalles.filter(d => 
            String(d.Ventas || '').trim() === String(idVenta).trim()
        );
        
        for (const item of itemsVenta) {
            await appsheetRequest('Detalle Venta', 'Edit', [{
                ID: item.ID,
                Status: 'Cancelado',
                'Motivo Cancelacion': motivo || 'Venta cancelada'
            }]);
        }
        
        // Cancelar todos los pagos
        const pagosTabla = await appsheetRequest('Pagos', 'Find');
        const pagosVenta = pagosTabla.filter(p => 
            String(p.Ventas || '').trim() === String(idVenta).trim()
        );
        
        for (const pago of pagosVenta) {
            await appsheetRequest('Pagos', 'Edit', [{
                Id: pago.Id || pago.ID,
                Estado: 'Cancelado'
            }]);
        }

        res.json({ 
            success: true, 
            mensaje: 'Venta cancelada exitosamente',
            itemsCancelados: itemsVenta.length,
            pagosCancelados: pagosVenta.length
        });
    } catch (error) {
        console.error('Error cancelando venta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancelar item individual de una venta
app.post('/api/ventas/:idVenta/cancelar-item', async (req, res) => {
    try {
        const { idVenta } = req.params;
        const { itemId, motivo, usuario } = req.body;
        
        const detalles = await appsheetRequest('Detalle Venta', 'Find');
        const item = detalles.find(d => 
            String(d.ID).trim() === String(itemId).trim() &&
            String(d.Ventas || '').trim() === String(idVenta).trim()
        );
        
        if (!item) {
            return res.status(404).json({ success: false, error: 'Item no encontrado' });
        }
        
        // Marcar item como cancelado
        await appsheetRequest('Detalle Venta', 'Edit', [{
            ID: itemId,
            Status: 'Cancelado',
            'Motivo Cancelacion': `${motivo || 'Sin motivo'} - Por: ${usuario || 'Sistema'}`
        }]);
        
        // Recalcular total de la venta
        const itemsActivos = detalles.filter(d => 
            String(d.Ventas || '').trim() === String(idVenta).trim() &&
            String(d.ID).trim() !== String(itemId).trim() &&
            (d.Status || 'Activo') !== 'Cancelado'
        );
        
        const nuevoTotal = itemsActivos.reduce((sum, d) => sum + (parseFloat(d.Total) || 0), 0);
        
        // Actualizar venta con nuevo total
        await appsheetRequest('Ventas', 'Edit', [{
            IdVenta: idVenta,
            'Total Venta': nuevoTotal
        }]);

        res.json({ 
            success: true, 
            mensaje: 'Item cancelado exitosamente',
            itemCancelado: item.Producto,
            nuevoTotal: nuevoTotal
        });
    } catch (error) {
        console.error('Error cancelando item:', error);
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
        version: '1.0.2',
        cors: 'enabled'
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
