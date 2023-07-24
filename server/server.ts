import { instrument } from '@socket.io/admin-ui'
import { Server } from 'socket.io'

const express = require('express')
const http = require('http')
const app = express()
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://admin.socket.io"],
    },
});


io.on('connection', (socket) => {

    //console.log('Client hat Verbindung hergestellt: ' + socket.id)
    //console.log(socket.handshake.query)
    //Create a new Lobby
    if (socket.handshake.query.request == 'createLobby') {
        console.log('createLobby server')
    }

    //Join lobby as player
    if (socket.handshake.query.request == 'joinLobby') {
        console.log('joinLobby server')
    }
    
    //Handle disconnect
    socket.on('disconnect', () => {
        console.log('Client hat Verbindung getrennt: ' + socket.id)
    })
})








// for test purposes
server.listen(3001, () => {
    console.log('Server schaut auf Port 3001')
})


//initializes admin ui without authentification on admin.socket.io
instrument(io, {
    auth: false 
})
