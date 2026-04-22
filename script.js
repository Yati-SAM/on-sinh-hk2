const quizData = window.__QUIZ_DATA__

if (!quizData || !Array.isArray(quizData.questions)) {
  throw new Error("Không tìm thấy dữ liệu bộ đề.")
}

const STORAGE_KEY = "bio12-ki2-quiz-v1"

const elements = {
  root: document.getElementById("quiz-root"),
  nav: document.getElementById("question-nav"),
  totalCount: document.getElementById("total-count"),
  completedCount: document.getElementById("completed-count"),
  partialCount: document.getElementById("partial-count"),
  remainingCount: document.getElementById("remaining-count"),
  submitButton: document.getElementById("submit-button"),
  submitProgress: document.getElementById("submit-progress"),
  toTopButton: document.getElementById("to-top-button"),
  resumeButton: document.getElementById("resume-button"),
  resetButton: document.getElementById("reset-button"),
  resultPanel: document.getElementById("result-panel"),
  scoreHeading: document.getElementById("score-heading"),
  scoreSubtext: document.getElementById("score-subtext"),
  reviewFilters: document.getElementById("review-filters"),
  toggleNavButton: document.getElementById("toggle-nav-button"),
}

const questionMap = new Map(quizData.questions.map((question) => [question.id, question]))

let state = loadState()
let currentFilter = "all"
let observer = null

renderQuiz()
bindEvents()
refreshUi()
initObserver()

function loadState() {
  const fallback = {
    answers: {},
    lastViewedId: null,
    submitted: false,
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw)
    const answers = {}

    for (const question of quizData.questions) {
      const saved = parsed.answers?.[question.id]
      if (!saved) {
        continue
      }

      if (question.type === "choice" && typeof saved.selected === "string") {
        answers[question.id] = { selected: saved.selected }
      }

      if (question.type === "true_false" && Array.isArray(saved.statements)) {
        answers[question.id] = {
          statements: question.statements.map((_, index) =>
            typeof saved.statements[index] === "boolean" ? saved.statements[index] : null,
          ),
        }
      }
    }

    const lastViewedId = questionMap.has(parsed.lastViewedId) ? parsed.lastViewedId : null

    return {
      answers,
      lastViewedId,
      submitted: Boolean(parsed.submitted),
    }
  } catch {
    return fallback
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function renderQuiz() {
  elements.root.innerHTML = ""

  let lastChapter = ""
  let lastSection = ""

  for (const question of quizData.questions) {
    if (question.chapter !== lastChapter || question.sectionTitle !== lastSection) {
      elements.root.append(createSectionCard(question))
      lastChapter = question.chapter
      lastSection = question.sectionTitle
    }

    elements.root.append(createQuestionCard(question))
  }

  renderQuestionNav()
}

function createSectionCard(question) {
  const section = document.createElement("section")
  section.className = "section-card"
  section.dataset.sectionKey = getSectionKey(question)

  const eyebrow = document.createElement("p")
  eyebrow.className = "eyebrow"
  eyebrow.textContent = question.chapter

  const title = document.createElement("h2")
  title.className = "section-title"
  title.textContent = question.sectionTitle

  section.append(eyebrow, title)
  return section
}

function createQuestionCard(question) {
  const article = document.createElement("article")
  article.className = "question-card"
  article.id = question.id
  article.dataset.id = question.id
  article.dataset.type = question.type
  article.dataset.sectionKey = getSectionKey(question)

  const head = document.createElement("div")
  head.className = "question-head"

  const questionPill = document.createElement("span")
  questionPill.className = "question-pill"
  questionPill.textContent = `${question.label} • #${question.seq}`

  const chapterPill = document.createElement("span")
  chapterPill.className = "chapter-pill"
  chapterPill.textContent = question.chapter

  const reviewBadge = document.createElement("span")
  reviewBadge.className = "review-badge"
  reviewBadge.dataset.role = "review-badge"
  reviewBadge.hidden = true

  head.append(questionPill, chapterPill, reviewBadge)

  const title = document.createElement("h3")
  title.className = "question-title"
  title.textContent = question.title

  article.append(head, title)

  if (question.contextBlocks.length > 0) {
    article.append(createContextBlock(question.contextBlocks))
  }

  if (question.type === "choice") {
    article.append(createChoiceOptions(question))
  } else {
    article.append(createTrueFalseStatements(question))
  }

  const reviewBox = document.createElement("div")
  reviewBox.className = "review-box"
  reviewBox.dataset.role = "review-box"
  article.append(reviewBox)

  return article
}

function createContextBlock(blocks) {
  const container = document.createElement("div")
  container.className = "question-context"

  for (const block of blocks) {
    if (block.type === "text") {
      const paragraph = document.createElement("p")
      paragraph.textContent = block.text
      container.append(paragraph)
    }

    if (block.type === "image") {
      const figure = document.createElement("figure")
      figure.className = "image-card"

      const image = document.createElement("img")
      image.src = block.src
      image.alt = block.alt
      image.loading = "lazy"

      figure.append(image)
      container.append(figure)
    }

    if (block.type === "table") {
      const wrapper = document.createElement("div")
      wrapper.className = "table-wrapper"

      const table = document.createElement("table")
      const tbody = document.createElement("tbody")

      block.rows.forEach((row, rowIndex) => {
        const tr = document.createElement("tr")

        row.forEach((cellText) => {
          const cell = document.createElement(rowIndex === 0 ? "th" : "td")
          cell.textContent = cellText
          tr.append(cell)
        })

        tbody.append(tr)
      })

      table.append(tbody)
      wrapper.append(table)
      container.append(wrapper)
    }
  }

  return container
}

function createChoiceOptions(question) {
  const container = document.createElement("div")
  container.className = "options-grid"

  question.options.forEach((option) => {
    const label = document.createElement("label")
    label.className = "option-card"
    label.dataset.option = option.key

    const input = document.createElement("input")
    input.type = "radio"
    input.name = question.id
    input.value = option.key
    input.dataset.questionId = question.id

    const key = document.createElement("span")
    key.className = "option-key"
    key.textContent = option.key

    const copy = document.createElement("span")
    copy.className = "option-copy"

    const text = document.createElement("span")
    text.className = "option-text"
    text.textContent = option.text

    const hint = document.createElement("span")
    hint.className = "option-hint"
    hint.dataset.role = "option-hint"

    copy.append(text, hint)
    label.append(input, key, copy)
    container.append(label)
  })

  return container
}

function createTrueFalseStatements(question) {
  const container = document.createElement("div")
  container.className = "statements-grid"

  question.statements.forEach((statement, index) => {
    const card = document.createElement("div")
    card.className = "statement-card"
    card.dataset.statementIndex = String(index)

    const top = document.createElement("div")
    top.className = "statement-top"

    const number = document.createElement("span")
    number.className = "statement-number"
    number.textContent = `${index + 1}`

    const choices = document.createElement("div")
    choices.className = "mini-choices"

    for (const value of [true, false]) {
      const label = document.createElement("label")
      label.className = "mini-choice"
      label.dataset.value = String(value)

      const input = document.createElement("input")
      input.type = "radio"
      input.name = `${question.id}-${index}`
      input.value = String(value)
      input.dataset.questionId = question.id
      input.dataset.statementIndex = String(index)

      label.append(input, document.createTextNode(value ? "Đ" : "S"))
      choices.append(label)
    }

    top.append(number, choices)

    const text = document.createElement("p")
    text.textContent = statement.text

    const meta = document.createElement("p")
    meta.className = "statement-meta"
    meta.dataset.role = "statement-meta"

    card.append(top, text, meta)
    container.append(card)
  })

  return container
}

function renderQuestionNav() {
  elements.nav.innerHTML = ""

  quizData.questions.forEach((question) => {
    const button = document.createElement("button")
    button.className = "nav-button"
    button.type = "button"
    button.dataset.target = question.id
    button.textContent = question.seq
    button.title = `${question.chapter} • ${question.label}`
    elements.nav.append(button)
  })
}

function getSectionKey(question) {
  return `${question.chapter}::${question.sectionTitle}`
}

function bindEvents() {
  elements.root.addEventListener("change", handleAnswerChange)
  elements.root.addEventListener("click", handleQuestionFocus)

  elements.nav.addEventListener("click", (event) => {
    const button = event.target.closest(".nav-button")
    if (!button) {
      return
    }

    const questionId = button.dataset.target
    scrollToQuestion(questionId)
  })

  elements.submitButton.addEventListener("click", submitQuiz)
  elements.toTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  })

  elements.resumeButton.addEventListener("click", () => {
    if (state.lastViewedId) {
      scrollToQuestion(state.lastViewedId)
    }
  })

  elements.resetButton.addEventListener("click", resetQuiz)

  elements.reviewFilters.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-button")
    if (!button) {
      return
    }

    currentFilter = button.dataset.filter
    applyFilter()
  })

  elements.toggleNavButton.addEventListener("click", () => {
    const collapsed = elements.nav.classList.toggle("is-collapsed")
    elements.toggleNavButton.textContent = collapsed ? "Mở lại" : "Thu gọn"
    elements.toggleNavButton.setAttribute("aria-expanded", String(!collapsed))
  })
}

function handleAnswerChange(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || state.submitted) {
    return
  }

  if (input.dataset.statementIndex !== undefined) {
    const questionId = input.dataset.questionId
    const statementIndex = Number(input.dataset.statementIndex)
    const answer = input.value === "true"
    setTrueFalseAnswer(questionId, statementIndex, answer)
  } else {
    setChoiceAnswer(input.dataset.questionId, input.value)
  }

  saveState()
  refreshUi()
}

function handleQuestionFocus(event) {
  const questionCard = event.target.closest(".question-card")
  if (!questionCard) {
    return
  }

  setLastViewed(questionCard.dataset.id)
}

function setChoiceAnswer(questionId, value) {
  state.answers[questionId] = { selected: value }
}

function setTrueFalseAnswer(questionId, index, value) {
  const question = questionMap.get(questionId)
  const current = state.answers[questionId]?.statements ?? new Array(question.statements.length).fill(null)
  current[index] = value
  state.answers[questionId] = { statements: current }
}

function getQuestionAnswer(question) {
  return state.answers[question.id] ?? null
}

function getCompletionState(question) {
  const saved = getQuestionAnswer(question)

  if (!saved) {
    return "empty"
  }

  if (question.type === "choice") {
    return saved.selected ? "done" : "empty"
  }

  const answeredCount = saved.statements.filter((value) => typeof value === "boolean").length
  if (answeredCount === 0) {
    return "empty"
  }
  if (answeredCount === question.statements.length) {
    return "done"
  }
  return "partial"
}

function getQuestionScore(question) {
  const saved = getQuestionAnswer(question)
  if (!saved) {
    return 0
  }

  if (question.type === "choice") {
    return saved.selected === question.answer ? 1 : 0
  }

  let correctCount = 0
  question.statements.forEach((statement, index) => {
    if (saved.statements?.[index] === statement.answer) {
      correctCount += 1
    }
  })
  return correctCount / question.statements.length
}

function getQuestionReviewState(question) {
  if (!state.submitted) {
    return getCompletionState(question)
  }

  return getQuestionScore(question) === 1 ? "correct" : "wrong"
}

function getFormattedScore(value) {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function refreshUi() {
  quizData.questions.forEach((question) => {
    refreshQuestionCard(question)
  })

  refreshSummary()
  refreshNav()
  refreshResumeButton()
  applyFilter()
}

function refreshQuestionCard(question) {
  const card = document.getElementById(question.id)
  if (!card) {
    return
  }

  const saved = getQuestionAnswer(question)
  const reviewState = getQuestionReviewState(question)

  card.dataset.reviewState = state.submitted ? reviewState : ""

  const reviewBadge = card.querySelector('[data-role="review-badge"]')
  const reviewBox = card.querySelector('[data-role="review-box"]')

  if (question.type === "choice") {
    const selected = saved?.selected ?? null
    const optionCards = card.querySelectorAll(".option-card")

    optionCards.forEach((optionCard) => {
      const input = optionCard.querySelector("input")
      const optionKey = optionCard.dataset.option
      const hint = optionCard.querySelector('[data-role="option-hint"]')

      input.checked = selected === optionKey
      input.disabled = state.submitted

      optionCard.classList.toggle("selected", selected === optionKey)
      optionCard.classList.toggle("is-correct", state.submitted && optionKey === question.answer)
      optionCard.classList.toggle(
        "is-wrong",
        state.submitted && selected === optionKey && optionKey !== question.answer,
      )

      if (state.submitted) {
        if (optionKey === question.answer) {
          hint.textContent = "Đáp án đúng"
        } else if (selected === optionKey && optionKey !== question.answer) {
          hint.textContent = "Bạn đã chọn"
        } else {
          hint.textContent = ""
        }
      } else {
        hint.textContent = ""
      }
    })

    if (state.submitted) {
      reviewBadge.hidden = false
      reviewBadge.textContent = reviewState === "correct" ? "Đúng" : "Sai"
      reviewBadge.className = `review-badge ${reviewState}`

      reviewBox.classList.add("is-visible")
      reviewBox.innerHTML = `
        <p class="review-copy">Bạn chọn: <strong>${selected ?? "Chưa chọn"}</strong></p>
        <p class="review-copy">Đáp án đúng: <strong>${question.answer}</strong></p>
        <p class="review-copy">Điểm câu: <strong>${getFormattedScore(getQuestionScore(question))} / 1.00</strong></p>
      `
    } else {
      reviewBadge.hidden = true
      reviewBox.classList.remove("is-visible")
      reviewBox.innerHTML = ""
    }
  } else {
    const savedStatements =
      saved?.statements ?? new Array(question.statements.length).fill(null)
    const statementCards = card.querySelectorAll(".statement-card")

    statementCards.forEach((statementCard, index) => {
      const currentValue = savedStatements[index]
      const correctValue = question.statements[index].answer
      const controls = statementCard.querySelectorAll(".mini-choice")
      const meta = statementCard.querySelector('[data-role="statement-meta"]')

      statementCard.classList.toggle("is-complete", typeof currentValue === "boolean")

      controls.forEach((control) => {
        const input = control.querySelector("input")
        const value = control.dataset.value === "true"
        input.checked = currentValue === value
        input.disabled = state.submitted

        control.classList.toggle("selected", currentValue === value)
        control.classList.toggle("correct", state.submitted && value === correctValue)
        control.classList.toggle(
          "wrong",
          state.submitted && currentValue === value && currentValue !== correctValue,
        )
      })

      if (state.submitted) {
        meta.textContent = `Bạn chọn: ${formatBooleanLabel(currentValue)} • Đáp án: ${formatBooleanLabel(
          correctValue,
        )}`
      } else {
        meta.textContent = typeof currentValue === "boolean" ? `Đã chọn: ${formatBooleanLabel(currentValue)}` : ""
      }
    })

    if (state.submitted) {
      const score = getQuestionScore(question)
      const correctStatements = Math.round(score * question.statements.length)

      reviewBadge.hidden = false
      reviewBadge.textContent = reviewState === "correct" ? "Đúng" : "Sai"
      reviewBadge.className = `review-badge ${reviewState}`

      reviewBox.classList.add("is-visible")
      reviewBox.innerHTML = `
        <p class="review-copy">Bạn đúng <strong>${correctStatements}/${question.statements.length}</strong> nhận định.</p>
        <p class="review-copy">Điểm câu: <strong>${getFormattedScore(score)} / 1.00</strong></p>
      `
    } else {
      reviewBadge.hidden = true
      reviewBox.classList.remove("is-visible")
      reviewBox.innerHTML = ""
    }
  }
}

function refreshSummary() {
  const total = quizData.questions.length
  const completed = quizData.questions.filter((question) => getCompletionState(question) === "done").length
  const partial = quizData.questions.filter((question) => getCompletionState(question) === "partial").length
  const remaining = total - completed - partial

  elements.totalCount.textContent = String(total)
  elements.completedCount.textContent = String(completed)
  elements.partialCount.textContent = String(partial)
  elements.remainingCount.textContent = String(remaining)
  elements.submitProgress.textContent = `${completed} / ${total}`

  if (state.submitted) {
    const totalScore = quizData.questions.reduce((sum, question) => sum + getQuestionScore(question), 0)
    const fullyCorrect = quizData.questions.filter((question) => getQuestionScore(question) === 1).length
    const wrongOrMissing = total - fullyCorrect

    elements.resultPanel.hidden = false
    elements.scoreHeading.textContent = `${getFormattedScore(totalScore)} / ${getFormattedScore(total)}`
    elements.scoreSubtext.textContent = `Đúng trọn vẹn ${fullyCorrect}/${total} câu. Sai hoặc thiếu ${wrongOrMissing}/${total} câu. Điểm phần đúng/sai được tính theo từng ý nên có số thập phân.`
    elements.submitButton.disabled = true
    elements.submitButton.querySelector("span").textContent = "Đã chấm"
  } else {
    elements.resultPanel.hidden = true
    elements.submitButton.disabled = false
    elements.submitButton.querySelector("span").textContent = "Nộp bài"
  }
}

function refreshNav() {
  const navButtons = elements.nav.querySelectorAll(".nav-button")

  navButtons.forEach((button) => {
    const question = questionMap.get(button.dataset.target)
    button.dataset.state = getQuestionReviewState(question)
    button.dataset.current = String(state.lastViewedId === question.id)
  })
}

function refreshResumeButton() {
  const question = state.lastViewedId ? questionMap.get(state.lastViewedId) : null
  if (!question) {
    elements.resumeButton.hidden = true
    return
  }

  elements.resumeButton.hidden = false
  elements.resumeButton.textContent = `Tiếp tục: ${question.label} • #${question.seq}`
}

function applyFilter() {
  const buttons = elements.reviewFilters.querySelectorAll(".filter-button")
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === currentFilter)
  })

  const cards = elements.root.querySelectorAll(".question-card")
  cards.forEach((card) => {
    if (!state.submitted || currentFilter === "all") {
      card.classList.remove("is-hidden")
      return
    }

    if (currentFilter === "correct") {
      card.classList.toggle("is-hidden", card.dataset.reviewState !== "correct")
      return
    }

    if (currentFilter === "wrong") {
      card.classList.toggle("is-hidden", card.dataset.reviewState !== "wrong")
    }
  })

  const sectionCards = elements.root.querySelectorAll(".section-card")
  sectionCards.forEach((sectionCard) => {
    if (!state.submitted || currentFilter === "all") {
      sectionCard.classList.remove("is-hidden")
      return
    }

    const visibleQuestion = elements.root.querySelector(
      `.question-card[data-section-key="${CSS.escape(sectionCard.dataset.sectionKey)}"]:not(.is-hidden)`,
    )
    sectionCard.classList.toggle("is-hidden", !visibleQuestion)
  })
}

function submitQuiz() {
  if (state.submitted) {
    return
  }

  state.submitted = true
  saveState()
  refreshUi()
  window.scrollTo({ top: 0, behavior: "smooth" })
}

function resetQuiz() {
  const confirmed = window.confirm("Xóa toàn bộ tiến trình và làm lại từ đầu?")
  if (!confirmed) {
    return
  }

  state = {
    answers: {},
    lastViewedId: null,
    submitted: false,
  }

  saveState()
  refreshUi()
  window.scrollTo({ top: 0, behavior: "smooth" })
}

function scrollToQuestion(questionId) {
  const target = document.getElementById(questionId)
  if (!target) {
    return
  }

  setLastViewed(questionId)
  target.scrollIntoView({ behavior: "smooth", block: "start" })
}

function setLastViewed(questionId) {
  if (!questionId || state.lastViewedId === questionId) {
    return
  }

  state.lastViewedId = questionId
  saveState()
  refreshNav()
  refreshResumeButton()
}

function initObserver() {
  if (observer) {
    observer.disconnect()
  }

  observer = new IntersectionObserver(
    (entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

      if (visibleEntries.length > 0) {
        setLastViewed(visibleEntries[0].target.dataset.id)
      }
    },
    {
      threshold: [0.35, 0.55],
    },
  )

  document.querySelectorAll(".question-card").forEach((card) => observer.observe(card))
}

function formatBooleanLabel(value) {
  if (value === true) {
    return "Đ"
  }
  if (value === false) {
    return "S"
  }
  return "Chưa chọn"
}
