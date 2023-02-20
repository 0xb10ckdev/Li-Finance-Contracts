import fs from 'fs'
import path from 'path'
import { Fragment } from '@ethersproject/abi'
import { task } from 'hardhat/config'

const basePath = 'src/Facets/'
const libraryBasePath = 'src/Libraries/'

task(
  'diamondABI',
  'Generates ABI file for diamond, includes all ABIs of facets'
).setAction(async () => {
  let files = fs.readdirSync(__dirname + '/../' + basePath)
  const abi: Fragment[] = []
  for (const file of files) {
    const jsonFile = file.replace('sol', 'json')
    const data = fs.readFileSync(
      path.resolve(__dirname, `../out/${file}/${jsonFile}`)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = JSON.parse(data.toString())
    abi.push(...json.abi)
  }
  files = fs.readdirSync(__dirname + '/../' + libraryBasePath)
  for (const file of files) {
    const jsonFile = file.replace('sol', 'json')
    if (jsonFile === 'LibStorage.json') {
      continue
    }
    const data = fs.readFileSync(
      path.resolve(
        __dirname,
        `../artifacts/${libraryBasePath}${file}/${jsonFile}`
      )
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = JSON.parse(data.toString())
    abi.push(...json.abi)
  }

  // Remove duplicates from the combined ABI object
  // Filters by checking if the name and type of the 
  // function already exists in another ABI fragment
  const cleanAbi = <Fragment[]>abi.filter(
    (item, index, self) =>
      index ===
      self.findIndex((t) => t.name === item.name && t.type === item.type)
  )
  const finalAbi = JSON.stringify(cleanAbi)
  fs.writeFileSync('./diamondABI/diamond.json', finalAbi)
  console.log('ABI written to diamondABI/diamond.json')
})
