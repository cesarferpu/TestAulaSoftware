const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');

const app = express();
const PORT = 3000;

app.use(express.json());

// Carregar documentação Swagger (OpenAPI)
let swaggerDocument;
try {
    swaggerDocument = YAML.load('./openapi.yaml');
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (e) {
    console.log('Ficheiro openapi.yaml não encontrado ou inválido. A ignorar /docs.');
}

// ======================================================
// DADOS EM MEMÓRIA
// ======================================================

const items = [
    { id: 1, name: 'Item 1' },
    { id: 2, name: 'Item 2' }
];

const books = [
    {
        id: 1,
        title: 'The Hobbit',
        author: 'J.R.R. Tolkien',
        status: 'available',
        createdAt: new Date().toISOString()
    },
    {
        id: 2,
        title: '1984',
        author: 'George Orwell',
        status: 'borrowed',
        createdAt: new Date().toISOString()
    }
];

// ======================================================
// FORMATO ÚNICO DE ERRO RFC 9457 (TP1)
// ======================================================

function sendError(res, status, title, detail) {
    return res
        .status(status)
        .type('application/problem+json')
        .json({
            status,
            title,
            detail
        });
}

// ======================================================
// ENDPOINTS REST - ITEMS (TP1)
// ======================================================

app.get('/api/items', (req, res) => {
    const { name, sort, order, page, limit } = req.query;
    let result = [...items];

    if (name !== undefined) {
        if (typeof name !== 'string') {
            return sendError(res, 400, 'Solicitud inválida', 'El parámetro name debe ser texto');
        }
        const term = name.trim().toLowerCase();
        result = result.filter(item => item.name.toLowerCase().includes(term));
    }

    if (sort) {
        if (sort !== 'id' && sort !== 'name') {
            return sendError(res, 400, 'Solicitud inválida', 'El parámetro sort debe ser id o name');
        }
        const orderDir = (order && order.toLowerCase() === 'desc') ? -1 : 1;
        result.sort((a, b) => {
            if (a[sort] < b[sort]) return -1 * orderDir;
            if (a[sort] > b[sort]) return 1 * orderDir;
            return 0;
        });
    }

    if (page !== undefined || limit !== undefined) {
        const pageNum = Number(page || 1);
        const limitNum = Number(limit || 10);

        if (!Number.isInteger(pageNum) || pageNum < 1 || !Number.isInteger(limitNum) || limitNum < 1) {
            return sendError(res, 400, 'Solicitud inválida', 'Parámetros de paginación deben ser enteros positivos');
        }

        const total = result.length;
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedItems = result.slice(startIndex, startIndex + limitNum);

        return res.status(200).json({
            page: pageNum,
            limit: limitNum,
            total,
            items: paginatedItems
        });
    }

    res.status(200).json(result);
});

app.get('/api/items/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(res, 400, 'Solicitud inválida', 'El id debe ser un entero positivo');
    }

    const item = items.find(item => item.id === id);
    if (!item) {
        return sendError(res, 404, 'No encontrado', `No existe item con id ${id}`);
    }

    res.status(200).json(item);
});

app.post('/api/items', (req, res) => {
    const { name } = req.body || {};

    if (typeof name !== 'string' || name.trim() === '') {
        return sendError(res, 400, 'Solicitud inválida', 'El campo name es obligatorio');
    }

    const newItem = {
        id: items.length ? Math.max(...items.map(item => item.id)) + 1 : 1,
        name: name.trim()
    };

    items.push(newItem);

    res.status(201)
        .location(`/api/items/${newItem.id}`)
        .json(newItem);
});

app.put('/api/items/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(res, 400, 'Solicitud inválida', 'El id debe ser un entero positivo');
    }

    const item = items.find(item => item.id === id);
    if (!item) {
        return sendError(res, 404, 'No encontrado', `No existe item con id ${id}`);
    }

    const { name } = req.body || {};
    if (typeof name !== 'string' || name.trim() === '') {
        return sendError(res, 400, 'Solicitud inválida', 'El campo name es obligatorio');
    }

    item.name = name.trim();
    res.status(200).json(item);
});

app.delete('/api/items/:id', (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return sendError(res, 400, 'Solicitud inválida', 'El id debe ser un entero positivo');
    }

    const index = items.findIndex(item => item.id === id);
    if (index === -1) {
        return sendError(res, 404, 'No encontrado', `No existe item con id ${id}`);
    }

    items.splice(index, 1);
    res.status(204).send();
});

// ======================================================
// ENDPOINTS REST - BOOKS (RECURSO ADICIONAL TP1)
// ======================================================

app.get('/api/books', (req, res) => {
    res.status(200).json(books);
});

app.get('/api/books/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return sendError(res, 400, 'Solicitud inválida', 'El id debe ser un entero positivo');
    }

    const book = books.find(b => b.id === id);
    if (!book) {
        return sendError(res, 404, 'No encontrado', `No existe libro con id ${id}`);
    }

    res.status(200).json(book);
});

app.post('/api/books', (req, res) => {
    const { title, author, status } = req.body || {};
    const validStatuses = ['available', 'borrowed', 'damaged'];

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return sendError(res, 400, 'Solicitud inválida', 'title es obligatorio');
    }
    if (!author || typeof author !== 'string' || author.trim() === '') {
        return sendError(res, 400, 'Solicitud inválida', 'author es obligatorio');
    }
    if (!validStatuses.includes(status)) {
        return sendError(res, 400, 'Solicitud inválida', 'Estado no permitido');
    }

    const exists = books.some(b => b.title.toLowerCase() === title.trim().toLowerCase());
    if (exists) {
        return sendError(res, 409, 'Conflicto', 'Ya existe un libro con ese título');
    }

    const newBook = {
        id: books.length ? Math.max(...books.map(b => b.id)) + 1 : 1,
        title: title.trim(),
        author: author.trim(),
        status,
        createdAt: new Date().toISOString()
    };

    books.push(newBook);
    res.status(201).location(`/api/books/${newBook.id}`).json(newBook);
});

// ======================================================
// GRAPHQL - TP2 (OPÇÃO A)
// ======================================================

const graphqlSchema = buildSchema(`
    type Item {
        id: Int!
        name: String!
    }

    type Book {
        id: Int!
        title: String!
        author: String!
        status: String!
        createdAt: String!
    }

    type Query {
        items: [Item!]!
        item(id: Int!): Item
        books: [Book!]!
        book(id: Int!): Book
    }

    type Mutation {
        createItem(name: String!): Item!
        createBook(title: String!, author: String!, status: String!): Book!
    }
`);

const graphqlResolvers = {
    items: () => items,
    item: ({ id }) => {
        if (id <= 0) throw new Error('ID inválido');
        return items.find(item => item.id === id);
    },
    books: () => books,
    book: ({ id }) => {
        if (id <= 0) throw new Error('ID inválido');
        return books.find(book => book.id === id);
    },
    createItem: ({ name }) => {
        if (!name || name.trim() === '') throw new Error('Nombre inválido');
        const newItem = {
            id: items.length ? Math.max(...items.map(i => i.id)) + 1 : 1,
            name: name.trim()
        };
        items.push(newItem);
        return newItem;
    },
    createBook: ({ title, author, status }) => {
        const validStatuses = ['available', 'borrowed', 'damaged'];
        if (!title || !author) throw new Error('Título y autor requeridos');
        if (!validStatuses.includes(status)) throw new Error('Estado no permitido');
        
        if (books.some(b => b.title.toLowerCase() === title.trim().toLowerCase())) {
            throw new Error('Conflicto: Título duplicado');
        }

        const newBook = {
            id: books.length ? Math.max(...books.map(b => b.id)) + 1 : 1,
            title: title.trim(),
            author: author.trim(),
            status,
            createdAt: new Date().toISOString()
        };
        books.push(newBook);
        return newBook;
    }
};

app.use('/graphql', graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolvers,
    graphiql: true
}));

// ======================================================
// TRATAMENTO DE ERROS GLOBAIS
// ======================================================

app.use((req, res) => {
    sendError(res, 404, 'No encontrado', 'La ruta solicitada no existe');
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return sendError(res, 400, 'Solicitud inválida', 'El JSON enviado es malformado');
    }
    sendError(res, 500, 'Error interno', 'Error inesperado del servidor');
});

app.listen(PORT, () => {
    console.log(`API a executar em http://localhost:${PORT}`);
    console.log(`Documentação Swagger UI disponível em http://localhost:${PORT}/docs`);
    console.log(`Interface GraphQL disponível em http://localhost:${PORT}/graphql`);
});