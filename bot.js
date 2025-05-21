const API_KEY = 'x.x.x.x.x.x'; // 
const submitButton = document.querySelector('#submit');
const outPutElement=document.querySelector('#output');
const inputElement=document.querySelector('input');
const historyElement = document.querySelector('.history')
const buttonElement = document.querySelector('button')
let retryAttempts = 0;

function changeInput(value){
    const inputElement = document.querySelector('input')
    inputElement.value= value
}

async function getMessage() {
    try {
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "model": "gpt-3.5-turbo",
                "messages": [{ role: "user", content: inputElement.value }],
                "max_tokens": 4000
            })
        };
        const response = await fetch('https://api.openai.com/v1/chat/completions', options);

        if (response.status === 429 && retryAttempts < 3) { 
            retryAttempts++;
            const retryDelay = Math.pow(2, retryAttempts) * 1000; 
            console.log(`Rate limited. Retrying in ${retryDelay / 1000} seconds.`);
            setTimeout(getMessage, retryDelay); 
            return;
        }

        const data = await response.json();
        console.log(data);
        outPutElement.textContent = data.choices[0].message.content
        if (data.choices[0].message.content && inputElement.value){
            const pElement = document.createElement('p')
            pElement.textContent = inputElement.value
            historyElement.append(pElement)

        }
    } catch (error) {
        console.error(error);
    }
}
function clarInput(){
    inputElement.value=''
}
submitButton.addEventListener('click', getMessage);
buttonElement.addEventListener('click', clarInput);
