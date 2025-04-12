// async function generateFlashcards() {
//     const note = document.getElementById("noteInput").value;
//     const response = await fetch("https://api.openai.com/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "Authorization": "Bearer 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"
//       },
//       body: JSON.stringify({
//         model: "gpt-3.5-turbo",
//         messages: [
//           { role: "system", content: "You are a helpful flashcard generator." },
//           { role: "user", content: `Create 3 flashcard-style questions and answers from this note: ${note}` }
//         ]
//       })
//     });

//     const data = await response.json();
//     if (!data.choices || !data.choices[0]) {
//         alert("Something went wrong. Please check your API key or try again.");
//         console.log("OpenAI Error Response:", data);
//         return;
//       }
//     const answer = data.choices[0].message.content;

//     const flashcardsDiv = document.getElementById("flashcards");
//     flashcardsDiv.innerHTML = "";
//     answer.split("\n\n").forEach(card => {
//       const [q, a] = card.split("\n");
//       const cardDiv = document.createElement("div");
//       cardDiv.className = "card";

//       const questionP = document.createElement("p");
//       questionP.className = "question";
//       questionP.textContent = q;
//       cardDiv.appendChild(questionP);

//       const answerP = document.createElement("p");
//       answerP.className = "answer";
//       answerP.textContent = a;
//       cardDiv.appendChild(answerP);

//       questionP.onclick = () => {
//         answerP.style.display = answerP.style.display === "none" ? "block" : "none";
//       };

//       flashcardsDiv.appendChild(cardDiv);
//     });
//   }
async function generateFlashcards() {
    const note = document.getElementById("noteInput").value;
  
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "" 
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful flashcard generator." },
          { role: "user", content: `Create 3 flashcard-style Q&A pairs from this note: ${note}` }
        ]
      })
    });
  
    const data = await response.json();
    console.log(" OpenAI Response:", data); // Show full response
  
    // Handle possible error
    if (data.error) {
      alert(" OpenAI API Error: " + data.error.message);
      return;
    }
  
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      alert(" Unexpected response structure. Check the console.");
      return;
    }
  
    const answer = data.choices[0].message.content;
  
    const flashcardsDiv = document.getElementById("flashcards");
    flashcardsDiv.innerHTML = "";
  
    answer.split("\n\n").forEach(card => {
      const [q, a] = card.split("\n");
      const cardDiv = document.createElement("div");
      cardDiv.className = "card";
  
      const questionP = document.createElement("p");
      questionP.className = "question";
      questionP.textContent = q || "Question missing";
      cardDiv.appendChild(questionP);
  
      const answerP = document.createElement("p");
      answerP.className = "answer";
      answerP.textContent = a || "Answer missing";
      answerP.style.display = "none"; // Initially hidden
      cardDiv.appendChild(answerP);
  
      questionP.onclick = () => {
        answerP.style.display = answerP.style.display === "none" ? "block" : "none";
      };
  
      flashcardsDiv.appendChild(cardDiv);
    });
  }
  
