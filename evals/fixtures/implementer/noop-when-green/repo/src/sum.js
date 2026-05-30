function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

module.exports = { sum };
