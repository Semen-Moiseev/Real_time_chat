const express = require('express') //Connection express
const path = require('path') //A module for working with paths
const fs = require('fs') //A module for working with files
const app = express() //Create express server

app.use(express.static(path.join(__dirname, 'public'))) //Отдаём статические файлы из public

//Givin a JSON dataset with users
app.get('/users', (req, res) => {
	try {
		const data = fs.readFileSync(path.join(__dirname, 'users.json'), 'utf-8')
		const users = JSON.parse(data)
		res.json(users)
	} catch (err) {
		console.error('Ошибка чтения users.json: ', err)
		res.status(500).json({ error: 'Не удалось загрузить пользователей' })
	}
})

app.listen(3000, () => {
	console.log('Сайт работает на http://localhost:3000')
})
