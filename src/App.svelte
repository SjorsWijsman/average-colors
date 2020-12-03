<script>
import FastAverageColor from "fast-average-color";
import { sort, ascending } from "d3-array";
const fac = new FastAverageColor();

let files = [];
let colors = [];
let sortedColors = []

function generateColors() {
	colors = [];
	for (const file of files) {
		fac.getColorAsync(URL.createObjectURL(file)).then(color => {
			colors = [...colors, color.hex];
		})
	}
}

$: sortedColors = [...colors], sortedColors.sort(ascending)
</script>

<style>
.image-container {
	margin-top: 1rem;
	height: 40rem;
	display: flex;
	flex-direction: row;
}

.image-container > * {
	flex: 1;
	min-width: 0;
}
</style>

<main>
	<input type="file" bind:files on:change={generateColors} accept="image/png, image/jpeg" multiple>

	<div class="image-container">
		{#each files as file}
			<img alt="slice" class="image-normal" src={URL.createObjectURL(file)}>
		{/each}
	</div>
	<div class="image-container">
		{#each colors as color}
			<div style={"background-color: " + color}/>
		{/each}
	</div>
	<div class="image-container">
		{#each sortedColors as color}
			<div style={"background-color: " + color}/>
		{/each}
	</div>
</main>
