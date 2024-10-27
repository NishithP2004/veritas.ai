import { sendMessage } from "./kafka.js"
import { generate_response } from "./ollama.js"
import { connectToDatabase } from "./mongo.js";

const db = await connectToDatabase()

const models = ["gemma2:2b"] // TODO: Add more models

async function guessPrompt(text) {
    try {
        const system =
            `
                Identify the original prompt which was used to generate the given input text.
                Your task is to reverse engineer the original prompt which was passed to a Large Language Model (LLM) to generate the given input text.
                The generated should resemble the structure of a prompt which is prompting an LLM model to do something.
                Ensure that the generated prompt captures the essence of the input text such that on passing this generated prompt to an LLM model, it is able to generate the input text.
                Be as specific as possible.
                Return your response in the following JSON format: 
                {
                    "prompt": ""
                }
            `

        const parameters = {
            model: "gemma2:2b",
            system: system,
            prompt: `INPUT TEXT: ${text}`,
            temperature: 0.7,
            format: "json"
        }

        const response = await generate_response(parameters)
        return JSON.parse(response)["prompt"]
    } catch (err) {
        console.error(`Error guessing prompt: ${err.message}`)
        throw err
    }
}

async function generatePerturb(parameters, task_id) {
    try {
        const { model, temperature } = parameters;

        console.log(`Model: ${model}`)
        const perturb = await generate_response(parameters)
        const doc = {
            text: perturb,
            metadata: {
                model,
                temperature
            },
            task_id  
        }

        await db.collection("perturbations").insertOne(doc)

        const requiredCount = models.length * 10;
        const availableCount = await db.collection("perturbations").countDocuments({
            task_id: ""
        })

        if(requiredCount === availableCount) {
            await sendMessage({
                topic: "fine_tune_llm",
                data: {
                    task_id
                }
            })
        }
    } catch(err) {
        console.error(`Error generating Perturb: ${err.message}`)
    }
}

async function generatePerturbations(prompt, task_id) {
    const messages = []
    for(let model of models) {
        const parameters = {
            prompt,
            temperature: i / 10,
            model
        }
        for(let i=1; i <= 10; i++) {
            messages.push(sendMessage({
                topic: "generate_perturbations",
                data: {
                    task_id,
                    ...parameters
                }
            }))
        }
    }

    return Promise.all(messages)
}

async function updateTask(hash, status="Started") {
    await db.collection("task").updateOne({
        task_id: hash
    }, {
        task_id: hash,
        status,
        last_modified: new Date().getTime()
    }, {
        upsert: true
    })
}

export { guessPrompt, generatePerturbations, generatePerturb, updateTask }