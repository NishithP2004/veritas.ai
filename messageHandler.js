import {
    guessPrompt,
    generatePerturb,
    generatePerturbations,
    updateTask,
    insertDocs,
    checkTaskCompletion,
    sleep
} from "./utils.js"
import {
    randomBytes
} from "node:crypto";
import {
    generateSearchQuery,
    extractSections,
    isEssay,
    filterCookiesAndPaywall,
    search,
    getPageContent
} from "./services/scraper.js"
import { client as redis } from "./services/redis.js"
import { sendMessage } from "./services/kafka.js";
import {
    markdownToTxt
} from "markdown-to-txt";

async function handleMessage(topic, data) {
    const { task_id } = data

    if (topic === "reverse_engineer_prompt") {
        console.log("Guessing Prompt")
        const prompt = await guessPrompt(data.text)
        const hash = randomBytes(4).toString("hex")
        console.log("Creating Task")
        await updateTask(hash, topic)

        console.log("Generating Perturbations")
        await sendMessage({
            topic: "generate_search_query",
            data: {
                task_id: hash,
                text: data.text
            }
        })
        await generatePerturbations(prompt, hash)
    } else if (topic === "generate_perturbation") {
        const {
            parameters
        } = data;

        console.log("Generating Perturb")
        await updateTask(task_id, topic)
        await generatePerturb(parameters, task_id);
    } else if (topic === "generate_search_query") {
        const { text } = data
        const search_query = await generateSearchQuery(text);
        console.log(`Search Query: ${search_query}`)

        await sendMessage({
            topic: "google_search",
            data: {
                task_id: task_id,
                search_query
            }
        })
    } else if (topic === "google_search") {
        const links = (await search(data.search_query, 10)).filter(link => !link.endsWith(".pdf"))
        console.log(links)
        console.log(links.length, "links")

        await redis.sAdd(`tasks:${task_id}:links:pending`, links)

        for(let link of links) {
            await sendMessage({
                topic: "crawl_website",
                data: {
                    task_id: task_id,
                    link
                }
            })
            await sleep(15)
        }
    } else if (topic === "crawl_website") {
        const { link, task_id } = data
        console.log(`Scraping: ${link}`)
        const content = (await redis.exists(link))? await redis.get(link): await getPageContent(link)
        .then(async (md) => {
            await redis.set(link, md, {
                EX: 60 * 5
            })

            return md
        })
        .catch(async err => {
            console.error(`Error scraping ${link}:`, err.message)
            await redis.sRem(`tasks:${task_id}:links:pending`, link)
            return ""
        })

        if(content) {
            const extracted = await Promise.all(extractSections(content).map(async section => {
                if (section && section.trim().length > 10) {
                    const isEssayResult = await isEssay(section);
                    await sleep(15)
                    if (isEssayResult && isEssayResult !== "null" && isEssayResult !== "false") {
                        const plainText = markdownToTxt(isEssayResult);
                        if (plainText.split(".").length > 2 && filterCookiesAndPaywall(plainText) < 0.70) {
                            return plainText;
                        }
                    }
                }
                return null;
            }));
    
            const docs = await Promise.all(extracted.filter(section => section).map(section => {
                return {
                    task_id,
                    text: section,
                    is_AI: 0,
                    metadata: {
                        link
                    }
                }
            }))
            
            const ack = await insertDocs(docs)
            if(ack)
                console.log(ack)
            
            await redis.sRem(`tasks:${task_id}:links:pending`, link)
        }

        await checkTaskCompletion(task_id)
    } else if (topic === "fine_tune_llm") {
        console.log("Fine Tuning !!!")
    }
}

export {
    handleMessage
}