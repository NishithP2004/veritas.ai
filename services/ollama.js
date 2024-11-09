import ollama from 'ollama';

const LLM_MODEL = "gemma2:2b"

async function loadModel(model) {
    return ollama.pull({
        model
    })
}

(async () => {
    await loadModel(LLM_MODEL);
})();

const generate_response = async (parameters) => {
    try {
        const {
            prompt,
            model,
            system,
            temperature,
            format
        } = parameters

        let response = (await ollama.generate({
            model,
            system,
            prompt,
            temperature,
            format
        })).response

        return response;
    } catch (err) {
        console.error(`Error generating AI response: ${err.message}`)
        throw err;
    }
}

const generate_embeddings = async (parameters) => {
    try {
        const {
            input,
            model
        } = parameters

        let embedding = (await ollama.embed({
            input,
            model
        })).embeddings[0]

        return embedding;
    } catch (err) {
        console.error(`Error generating embeddings: ${err.message}`)
        throw err;
    }
}

export { generate_response, generate_embeddings }