const express = require('express') //Connection express
const path = require('path') //A module for working with paths
const fs = require('fs') //A module for working with files
const app = express() //Create express server

const { WebSocketServer } = require('ws')
const { v4: uuidv4 } = require('uuid') //Уникальный id WebSocket соединения

app.use(express.static(path.join(__dirname, 'public'))) //Отдаём статические файлы из public

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

// Запуск Express и WebSocket
const server = app.listen(3000, () => {
	console.log('Сервер: http://localhost:3000')
})
const wss = new WebSocketServer({ server })

// Данные в памяти о каналах и онлайн пользователях
const channels = {} //id, name, creatorId, participants: [], messages: []
const onlineUsers = {} //id, name

// Отправка сообщения всем
function broadcast(payload) {
	const data = JSON.stringify(payload)
	wss.clients.forEach(client => {
		if (client.readyState === 1) client.send(data)
	})
}

// Обработка WS соединений
wss.on('connection', ws => {
	const socketId = uuidv4()
	ws.sid = socketId //Сохраняем в сокете

	ws.on('message', raw => {
		let msg
		try {
			msg = JSON.parse(raw)
		} catch {
			return
		}
		const { type, payload } = msg

		switch (type) {
			//Инициализация клиента
			case 'init': {
				const usersJSON = JSON.parse(
					fs.readFileSync(path.join(__dirname, 'users.json'))
				)
				ws.send(
					JSON.stringify({ type: 'state', payload: { usersJSON, channels } })
				)
				break
			}

			//Авторизация пользователя
			case 'login': {
				onlineUsers[socketId] = { id: payload.id, name: payload.name }
				broadcast({
					type: 'online_update',
					payload: Object.values(onlineUsers),
				})
				break
			}

			//Создание канала
			case 'create_channel': {
				const channelId = uuidv4() // Уникальный ID канала
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

			//Присоединение к каналу
			case 'join_channel': {
				const channel = channels[payload.channelId]
				if (channel && !channel.participants.includes(payload.userId)) {
					channel.participants.push(payload.userId)
					broadcast({ type: 'channels_update', payload: channels })
				}
				break
			}

			//Новое сообщение
			case 'new_message': {
				const messageId = uuidv4() // Уникальный ID сообщения
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

			//Удалить пользователя из канала
			case 'remove_user': {
				const channel = channels[payload.channelId]
				if (channel) {
					channel.participants = channel.participants.filter(
						id => id !== payload.userId
					)
					broadcast({ type: 'channels_update', payload: channels })

					// найти удалённого юзера и отправить ему "kicked"
					for (const [sid, user] of Object.entries(onlineUsers)) {
						// ищем в onlineUsers пользователя с таким id
						if (user.id === payload.userId) {
							// перебираем все открытые WebSocket соединения
							wss.clients.forEach(c => {
								// ищем то самое соединение по sid
								if (c.readyState === 1 && c.sid === sid) {
									// отправляем только ему сообщение
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
