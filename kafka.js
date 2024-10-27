import { Kafka } from "kafkajs";
// import ip from "ip"
import "dotenv/config"
import { guessPrompt, generatePerturb, generatePerturbations, updateTask } from "./utils.js"
import { randomBytes } from "node:crypto";

// const HOST_IP = process.env.HOST_IP || ip.address()
const kafka = new Kafka({
    clientId: "veritas.ai",
    brokers: ["kafka:9092"]
})

const producer = kafka.producer()
const consumer = kafka.consumer({
    groupId: "veritas-consumer-group-0"
})

const topics = ["reverse_engineer_prompt", "generate_perturbation", "fine_tune_llm", "classify_text"]

async function sendMessage(message) {
    const { topic, data } = message
    const metadata = await producer.send({
        topic,
        messages: [
            {
                value: JSON.stringify(data)
            }
        ]
    })

    return metadata
}

const initKafka = async () => {
    await producer.connect()
    /* await producer.send({
        topic: "foo-bar",
        messages: [
            {
                value: "Hello World"
            }
        ]
    }) */

    await consumer.connect()
    await consumer.subscribe({
        topics
    })

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const data = JSON.parse(message.value.toString())
            console.log({
                topic,
                partition,
                offset: message.offset,
                value: data
            })

            switch(topic) {
                case "reverse_engineer_prompt":
                    const prompt = await guessPrompt(data.text)
                    const hash = randomBytes(4).toString("hex")

                    // TODO: Associate Task with User ID
                    await updateTask(hash, "Started")
                    await generatePerturbations(prompt, hash)
                    break;
                case "generate_perturbation":
                    const { parameters, task_id } = data;
                    await generatePerturb(parameters, task_id);
                    break;
                case "fine_tune_llm":
                    console.log("Fine Tuning !!!")
            }
        }
    })
}

initKafka().catch(console.error)

export { sendMessage }