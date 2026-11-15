"""Macedonian for the assistant's own text: the steps it shows, proposal cards and its messages.

The agent translates its streamed events with these (the response middleware only sees JSON, not NDJSON);
main.py registers them with the others. The model itself is told to answer in Macedonian (agent.py).
"""

CATALOG: dict[str, str] = {
    # Steps (tools.describe)
    "Opening the Command Center at {d}": "Се отвора Командниот центар на {d}",
    "Opening the Command Center": "Се отвора Командниот центар",
    "Running the simulation": "Се пушта симулацијата",
    "Running the simulation: {rest}": "Се пушта симулацијата: {rest}",
    "rain {r}%": "дожд {r}%",
    "irrigation {m}": "наводнување {m}",
    "Opening the farm profile": "Се отвора профилот на фармата",
    "Opening the report view": "Се отвора извештајот",
    "Preparing a change for you to confirm": "Се подготвува промена за ваша потврда",
    "Opening {page}": "Се отвора {page}",
    "overview": "прегледот", "command center": "Командниот центар", "simulator": "Симулаторот", "farm profile": "профилот на фармата",
    # Proposal cards (tools.propose_farm_change)
    "Change {name}": "Промена на {name}",
    "Add to {name}'s crop history": "Додавање во историјата на култури на {name}",
    "Add a field": "Додавање нива",
    "Name: {a} → {b}": "Име: {a} → {b}",
    "Current crop: {a} → {b}": "Тековна култура: {a} → {b}",
    "Irrigation: {a} → {b}": "Наводнување: {a} → {b}",
    "Soil texture: {a} → {b}": "Текстура на почвата: {a} → {b}",
    "Area: {a} ha → {b} ha (farmer-stated)": "Површина: {a} ha → {b} ha (внесено од земјоделецот)",
    "Region: {a} → {b}": "Регион: {a} → {b}",
    "Constraints: {a} → {b}": "Ограничувања: {a} → {b}",
    "Priority {k}: {a} → {b}": "Приоритет {k}: {a} → {b}",
    "{year}: {crop}, yield {v} {u} (farmer-reported){rest}": "{year}: {crop}, принос {v} {u} (пријавено од земјоделецот){rest}",
    "{year}: {crop}{rest}": "{year}: {crop}{rest}",
    ", note: {rest}": ", белешка: {rest}",
    "Name: {a}": "Име: {a}",
    "Current crop: {a}": "Тековна култура: {a}",
    "Irrigation: {a}": "Наводнување: {a}",
    "Soil texture: {a}": "Текстура на почвата: {a}",
    "available": "има", "not available": "нема", "not set": "не е поставено",
    "You draw the outline on the map; its area is computed from it.": "Вие ја цртате контурата на картата; површината се пресметува од неа.",
    "yield": "принос", "water": "вода", "risk": "ризик", "soil": "почва", "margin": "маржа",
    # Messages
    "The assistant took too many steps. Try a simpler request.": "Асистентот направи премногу чекори. Обидете се со поедноставно барање.",
    "The assistant didn't return an answer. Try again, or ask a shorter question.": "Асистентот не врати одговор. Обидете се повторно или поставете пократко прашање.",
    "Done: {rest_done}. I couldn't write an explanation: {rest_why}": "Готово: {rest_done}. Не можев да напишам објаснување: {rest_why}",
    "I can't help with that question. Try asking about the results on this page.":
        "Не можам да помогнам со тоа прашање. Прашајте за резултатите на оваа страница.",
    "The advisor has hit its free usage limit for now. Try again in a minute, or tomorrow if the daily limit is used up.":
        "Советникот ја достигна бесплатната граница за користење. Обидете се повторно за една минута, или утре ако дневната граница е потрошена.",
    "The advisor isn't configured: put a free Groq API key in LLM_API_KEY in .env (see .env.example).":
        "Советникот не е поставен: внесете бесплатен Groq API клуч во LLM_API_KEY во .env (видете .env.example).",
    "The advisor's API key was rejected. Check LLM_API_KEY in .env.": "API клучот на советникот е одбиен. Проверете го LLM_API_KEY во .env.",
    "Couldn't reach the advisor service. Check the internet connection.": "Услугата на советникот не е достапна. Проверете ја интернет врската.",
    "The advisor service returned an error ({a}). Try again.": "Услугата на советникот врати грешка ({a}). Обидете се повторно.",
    "This question and its facts are too long for the advisor's free tier.": "Ова прашање и неговите факти се предолги за бесплатното ниво на советникот.",
    "The assistant's reply came out garbled. Try again.": "Одговорот на асистентот излезе неразбирлив. Обидете се повторно.",
}
