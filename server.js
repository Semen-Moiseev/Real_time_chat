const express = require('express') //Connection express
const path = require('path') //A module for working with paths
const fs = require('fs') //A module for working with files
const app = express() //Create express server

const { WebSocketServer } = require('ws')
const { v4: uuidv4 } = require('uuid') //Unique WebSocket connection ID

app.use(express.static(path.join(__dirname, 'public'))) //Static files from public

//Givin a JSON dataset with users
app.get('/users', (req, res) => {
	try {
		const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf-8')
		const usersJSON = JSON.parse(data)
		res.json(usersJSON)
	} catch (err) {
		console.error('Ошибка чтения users.json: ', err)
		res.status(500).json({ error: 'Не удалось загрузить пользователей' })
	}
})

//Launching Express and WebSocket
const server = app.listen(3000, () => {
	console.log('Сервер: http://localhost:3000')
})
const wss = new WebSocketServer({ server })

const channels = {} //id, name, creatorId, participants: [], messages: []
const onlineUsers = {} //id, name

//Sending to all
function broadcast(payload) {
	const data = JSON.stringify(payload)
	wss.clients.forEach(client => {
		if (client.readyState === 1) client.send(data)
	})
}

//Processing of WS connections
wss.on('connection', ws => {
	const socketId = uuidv4()
	ws.sid = socketId //Saving the id in the socket

	ws.on('message', raw => {
		let msg
		try {
			msg = JSON.parse(raw)
		} catch {
			return
		}
		const { type, payload } = msg

		switch (type) {
			//Client initialization
			case 'init': {
				const usersJSON = JSON.parse(
					fs.readFileSync(path.join(__dirname, 'users.json'))
				)
				ws.send(
					JSON.stringify({ type: 'state', payload: { usersJSON, channels } })
				)
				break
			}

			//User authorization
			case 'login': {
				onlineUsers[socketId] = { id: payload.id, name: payload.name }
				broadcast({
					type: 'online_update',
					payload: Object.values(onlineUsers),
				})
				break
			}

			case 'create_channel': {
				const channelId = uuidv4() //Unique channel ID
				channels[channelId] = {
					id: channelId,
					name: payload.name,
					creatorId: payload.creatorId,
					participants: [payload.creatorId],
					messages: [],
				}
				broadcast({ type: 'channels_update', payload: channels })
				break
			}

			case 'join_channel': {
				const channel = channels[payload.channelId]
				if (channel && !channel.participants.includes(payload.userId)) {
					channel.participants.push(payload.userId)
					broadcast({ type: 'channels_update', payload: channels })
				}
				break
			}

			case 'new_message': {
				const messageId = uuidv4() //Unique message ID
				const channel = channels[payload.channelId]
				if (!channel) return
				const message = {
					id: messageId,
					userId: payload.userId,
					text: payload.text,
					createdAt: Date.now(),
				}
				channel.messages.push(message)
				broadcast({
					type: 'message',
					payload: { channelId: payload.channelId, message },
				})
				break
			}

			case 'remove_user': {
				const channel = channels[payload.channelId]
				if (channel) {
					channel.participants = channel.participants.filter(
						id => id !== payload.userId
					)
					broadcast({ type: 'channels_update', payload: channels })

					//Find a remote user and send them a "kicked"
					for (const [sid, user] of Object.entries(onlineUsers)) {
						//Find a user with this id in onlineUsers
						if (user.id === payload.userId) {
							//Iterating through all open WebSocket connections
							wss.clients.forEach(c => {
								//Looking for the same connection by sid
								if (c.readyState === 1 && c.sid === sid) {
									//Send a message only to him
									c.send(
										JSON.stringify({
											type: 'kicked',
											payload: { channelId: payload.channelId },
										})
									)
								}
							})
						}
					}
				}
				break
			}
		}
	})

	ws.on('close', () => {
		delete onlineUsers[socketId]
		broadcast({ type: 'online_update', payload: Object.values(onlineUsers) })
	})
})
