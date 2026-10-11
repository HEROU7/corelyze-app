"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Iniciando seed...');
    const marcas = [
        { nombre: 'Intel', slug: 'intel', colorHex: '#0068B5' },
        { nombre: 'AMD', slug: 'amd', colorHex: '#ED1C24' },
        { nombre: 'NVIDIA', slug: 'nvidia', colorHex: '#76B900' },
        { nombre: 'Corsair', slug: 'corsair', colorHex: '#000000' },
        { nombre: 'ASUS', slug: 'asus', colorHex: '#000000' },
        { nombre: 'MSI', slug: 'msi', colorHex: '#000000' },
        { nombre: 'Samsung', slug: 'samsung', colorHex: '#1428A0' },
        { nombre: 'Kingston', slug: 'kingston', colorHex: '#000000' },
        { nombre: 'Seagate', slug: 'seagate', colorHex: '#6C6F7F' },
        { nombre: 'be quiet!', slug: 'be-quiet', colorHex: '#000000' },
    ];
    for (const marca of marcas) {
        await prisma.marca.upsert({
            where: { slug: marca.slug },
            update: {},
            create: marca,
        });
    }
    console.log('✓ Marcas creadas');
    const categorias = [
        { nombre: 'Procesadores', slug: 'cpu', icono: 'cpu' },
        { nombre: 'Tarjetas Madre', slug: 'motherboard', icono: 'motherboard' },
        { nombre: 'Memoria RAM', slug: 'ram', icono: 'ram' },
        { nombre: 'Tarjetas Gráficas', slug: 'gpu', icono: 'gpu' },
        { nombre: 'Almacenamiento', slug: 'storage', icono: 'storage' },
        { nombre: 'Fuentes de Poder', slug: 'psu', icono: 'psu' },
        { nombre: 'Gabinetes', slug: 'case', icono: 'case' },
        { nombre: 'Refrigeración', slug: 'cooler', icono: 'cooler' },
    ];
    for (const categoria of categorias) {
        await prisma.categoria.upsert({
            where: { slug: categoria.slug },
            update: {},
            create: categoria,
        });
    }
    console.log('✓ Categorías creadas');
    const reglas = [
        {
            nombre: 'Socket CPU-Motherboard',
            tipo: 'SOCKET_COMPATIBILITY',
            descripcion: 'Verifica compatibilidad entre socket de CPU y socket de motherboard',
            condicion: { tipo: 'socket_match' },
            accion: { tipo: 'bloquear_si_no_coincide' },
            prioridad: 10,
        },
        {
            nombre: 'Memoria RAM',
            tipo: 'RAM_COMPATIBILITY',
            descripcion: 'Verifica tipo DDR4/DDR5 entre RAM y motherboard',
            condicion: { tipo: 'ram_type_match' },
            accion: { tipo: 'bloquear_si_no_coincide' },
            prioridad: 9,
        },
        {
            nombre: 'Balance Energético',
            tipo: 'POWER_BALANCE',
            descripcion: 'Verifica que PSU tenga suficiente potencia (TDP + margen 20%)',
            condicion: { tipo: 'power_calculation', margen: 1.2 },
            accion: { tipo: 'alerta_si_insuficiente' },
            prioridad: 8,
        },
    ];
    for (const regla of reglas) {
        await prisma.reglaValidacion.upsert({
            where: { nombre: regla.nombre },
            update: {},
            create: regla,
        });
    }
    console.log('✓ Reglas de validación creadas');
    await prisma.configuracionSistema.upsert({
        where: { clave: 'system.version' },
        update: {},
        create: {
            clave: 'system.version',
            valor: { version: '1.0.0', fecha: new Date().toISOString() },
            descripcion: 'Versión actual del sistema',
        },
    });
    console.log('✓ Configuración creada');
    console.log('✅ Seed completado exitosamente!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map