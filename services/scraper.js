import puppeteer from "puppeteer"
import { NodeHtmlMarkdown } from 'node-html-markdown'
import {
    generate_response
} from "./ollama.js";
import natural from "natural"
import "dotenv/config"

const nhm = new NodeHtmlMarkdown()

async function search(query, depth = 10) {
    try {
        let url, startIndex=0;
        const links = []

        for (let i = 1; i <= depth; i++) {
            url = `https://www.googleapis.com/customsearch/v1/?cx=${process.env.G_CX}&key=${process.env.G_SEARCH_KEY}&q=${query}&count=10&start=${startIndex}`;
            let res = await fetch(url)
                .then((r) => r.json())

            let fetchedLinks = (res.items) ? res.items.map((item) => {
                return item.link
            }) : []
            links.push(...fetchedLinks)

            startIndex = res.queries?.nextPage[0]?.startIndex;
            if(!startIndex) break;
        }
        
        return Array.from(new Set(links));
    } catch (err) {
        console.error(err.message);
        return []
    }
}

async function getPageContent(url) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox'],
        headless: "shell"
    })
    try {
        const page = await browser.newPage();
        await page.goto(url, {
            waitUntil: "domcontentloaded"
        });
        const content = await page.evaluate(() => document.body.innerHTML);

        await browser.close();

        return nhm.translate(content)
    } catch (err) {
        await browser.close()
        throw err
    } finally {
        await browser.close()
    }
}

async function generateSearchQuery(text) {
    try {
        const system =
        `
            Given an input essay, identify the key topics and keywords within the essay that would be most useful for locating relevant related essays on Google. 
            Please ensure the topics and keywords are as specific and relevant as possible. 
            The search query should resemble the following format: 'essay on Artificial Intelligence'
            Return your response containing the search query in the following JSON format:
            {
                "search_query": ""
            }
        `

        const parameters = {
            model: "gemma2:2b",
            system: system.trim(),
            prompt: text,
            temperature: 0.7,
            format: "json"
        }

        const response = await generate_response(parameters)
        return JSON.parse(response)["search_query"]
    } catch (err) {
        console.error(`Error generating search_query: ${err.message}`)
        throw err
    }
}

async function isEssay(text) {
    try {
        const system =
            `
                Classify the given input text as either "essay content" or "non-essay content." 
                Your task is to filter out common noise typically found on public websites, such as headers, footers, social media links, navigation and menu links, comments sections, advertisements, and promotional text. 
                The goal is to identify and extract only the meaningful paragraphs of the essay from the web document, presented in a clean and formatted manner, without modifying or altering the essay's original content or integrity.

                If the input text exclusively contains essay content, return a cleaned and properly formatted version of the essay in the specified format. If any noise or non-essay content is detected within the input, return "null."

                Requirements:
                - Maintain the essay content's integrity without any changes.
                - Return the response in this JSON format:
                {
                    "essay": "cleaned essay content" || "null"
                }

                Examples:

                1. Input:

                Header: Welcome to Our Blog!
                Explore: Home | About Us | Contact
                Follow us on Twitter and Facebook
                
                In recent years, the debate on climate change has gained significant traction. Scientists have pointed out the impact of human activities on global temperatures, resulting in unprecedented environmental shifts...

                Output:
                {
                    "essay": "In recent years, the debate on climate change has gained significant traction. Scientists have pointed out the impact of human activities on global temperatures, resulting in unprecedented environmental shifts..."
                }

                2. Input:
                
                Footer: Contact us | Terms of Service | Privacy Policy
                All rights reserved © 2023
                Check out our other articles on health, wellness, and self-improvement.

                Output:
                {
                    "essay": "null"
                }

                3. Input:

                Targeting cookies may be set through our site by our advertising partners. These cookies are used to show relevant ads. If you do not allow these cookies, you will experience less targeted advertising.
                We use cookies to enhance your experience. By clicking 'Accept,' you agree to our cookie policy.

                Output:
                {
                    "essay": "null"
                }

                4. Input:

                To support independent journalism and keep articles like this available, consider subscribing for unlimited access to our stories.
            
                Output:
                {
                    "essay": "null"
                }

                Guidance: Use the examples above to identify and exclude non-essay content. Retain only coherent, meaningful essay paragraphs if the content qualifies as an essay.
            `

        const parameters = {
            model: "gemma2:2b",
            system: system.trim(),
            prompt: `INPUT TEXT: ${text}`,
            temperature: 0.7,
            format: "json"
        }

        const response = await generate_response(parameters)
        
        return JSON.parse(response)["essay"]
    } catch (err) {
        console.error(`Error checking if the given text is an Essay: ${err.message}`)
        return null
    }
}

function extractSections(md) {
    const regex = /^(?<=#{1,6}\s*.*\n)([\s\S]*?)(?=\n#{1,6}\s)/gim
    return (typeof md === "string")? md.match(regex) || []: []
}

function filterCookiesAndPaywall(text) {
    const noise = [
        "We use cookies and other technologies to help improve your experience; some are necessary for the site to work, and some are optional.",
        "This Cookie Notice .* understanding how and why .* uses cookies and other similar technologies",
        "These cookies are necessary for the website to function and cannot be switched off in our systems",
        "Performance Cookies .* allow us to count visits and traffic sources so we can measure and improve the performance of our site",
        "These cookies enable the website to provide enhanced functionality and personalisation",
        "Targeting Cookies .* may be used by advertising partners to build a profile of your interests and show you relevant adverts",
        "For the past .* has brought you the best of the book world for free.* our future relies on you",
        "Become a member for as low as .*",
        "Dismiss without supporting .*",
        "Subscribe to access this article",
        "Sign up to continue reading",
        "Join now to get full access",
        "Click here to manage your preferences",
        "Read our privacy policy for more information",
        "Strictly necessary cookies are essential for the website to function correctly. These cookies may be used to assist in fraud prevention, security and to enable filling in forms. You can set your browser to block or alert you about these cookies, but without them, some parts of the website may not work. Functionality cookies may collect a unique identifier assigned to an internet enabled device (mobile, tablet), geolocation data or other traffic information for that device. These features help us improve your experience with the website, for example, to determine the appropriate device location during a session or store language settings."
    ];
    
    const scores = noise.map(n => natural.JaroWinklerDistance(text, n, {
        ignoreCase: true
    })).sort((a, b) => b - a)

    return scores[0]
}

export {
    generateSearchQuery,
    isEssay,
    extractSections,
    filterCookiesAndPaywall,
    search,
    getPageContent
}