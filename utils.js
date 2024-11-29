import { sendMessage } from "./services/kafka.js"
import { generate_response, models } from "./services/ollama.js"
import { connectToDatabase } from "./services/mongo.js";
import { client as redis } from "./services/redis.js";

const db = await connectToDatabase()

async function sleep(delay) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve()
        }, delay * 1000)
    })
}

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

async function checkTaskCompletion(task_id) {
    const requiredCount = models.length * 10;
    const availableCount = await db.collection("perturbations").countDocuments({
        task_id,
        is_AI: 1
    })

    const setSize = await redis.sCard(`tasks:${task_id}:links:pending`)

    if ((requiredCount === availableCount) && setSize == 0) {
        await sendMessage({
            topic: "fine_tune_llm",
            data: {
                task_id
            }
        })
    }
}

async function generatePerturb(parameters, task_id) {
    try {
        const { model, temperature } = parameters;

        console.log(`Model: ${model}`)
        const perturb = await generate_response(parameters)
        const doc = {
            task_id,
            text: perturb,
            is_AI: 1,
            parameters: {
                model,
                temperature
            }
        }

        await db.collection("perturbations").insertOne(doc)

        await checkTaskCompletion(task_id)
    } catch(err) {
        console.error(`Error generating Perturb: ${err.message}`)
    }
}

async function generatePerturbations(prompt, task_id) {
    const messages = []
    for(let model of models) {
        for(let i=0; i <= 100; i+=2) {
            const parameters = {
                prompt,
                temperature: i / 100,
                model
            }
            console.log(parameters)
            messages.push(await sendMessage({
                topic: "generate_perturbation",
                data: {
                    task_id,
                    parameters
                }
            }))
            if(i % 4 === 0) await sleep(15)
        }
        await sleep(0.5 * 60) 
    }

    return Promise.all(messages)
}

async function updateTask(hash, status="started") {
    return redis.hSet(`task:${hash}`, {
        status,
        last_modified: new Date().getTime()
    })
}

async function insertDocs(docs) {
    return (docs.length > 0)? db.collection("perturbations").insertMany(docs): null;
}

export { guessPrompt, generatePerturbations, generatePerturb, updateTask, insertDocs, checkTaskCompletion, sleep }