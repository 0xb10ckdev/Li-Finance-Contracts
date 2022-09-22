/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  StargateFacet,
  DexManagerFacet,
  IERC20 as ERC20,
  IERC20__factory as ERC20__factory,
} from '../../typechain'
import { deployments, ethers, network } from 'hardhat'
import { constants, utils } from 'ethers'
import { node_url } from '../../utils/network'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import { expect } from '../chai-setup'
import approvedFunctionSelectors from '../../utils/approvedFunctions'
import config, { POOLS, PAYLOAD_ABI } from '../../config/stargate'

const WMATIC_ADDRESS = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
const UNISWAP_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

const TEST_CHAINS: any = {
  Ethereum: 'mainnet',
  BSC: 'bsc',
  Avalanche: 'avalanche',
  Polygon: 'polygon',
  Arbitrum: 'arbitrumOne',
  Optimism: 'optimisticEthereum',
  Fantom: 'opera',
}
const SRC_CHAIN = 'Polygon'
const SRC_ASSET = 'USDT'

describe('StargateFacet', function () {
  let lifi: StargateFacet
  let dexMgr: DexManagerFacet
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let usdt: ERC20
  let wmatic: ERC20
  let bridgeData: any
  let testStargateData: any
  let swapData: any
  let payloadSwapData: any

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture('DeployStargateFacet')
      const diamond = await ethers.getContract('LiFiDiamond')
      
      lifi = <StargateFacet>(
        await ethers.getContractAt('StargateFacet', diamond.address)
      )
      dexMgr = <DexManagerFacet>(
        await ethers.getContractAt('DexManagerFacet', diamond.address)
      )

      await dexMgr.addDex(UNISWAP_ADDRESS)
      await dexMgr.batchSetFunctionApprovalBySignature(
        approvedFunctionSelectors,
        true
      )

      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ['0x06959153b974d0d5fdfd87d561db6d8d4fa0bb0b'],
      })
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: ['0xf71b335a1d9449c381d867f4172fc1bb3d2bfb7b'],
      })
      await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [config[TEST_CHAINS[SRC_CHAIN]].stargateRouter],
      })

      alice = await ethers.getSigner(
        '0x06959153b974d0d5fdfd87d561db6d8d4fa0bb0b'
      )
      bob = await ethers.getSigner('0xf71b335a1d9449c381d867f4172fc1bb3d2bfb7b')

      await lifi.initStargate(bob.address)

      wmatic = ERC20__factory.connect(WMATIC_ADDRESS, alice)
      usdt = ERC20__factory.connect(
        POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
        alice
      )
      
      testStargateData = {
        router: config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
        dstPoolId: 2,
        minAmountLD: utils.parseUnits('100', 6),
        dstGasForCall: 0,
        callTo: alice.address,
        callData: '0x',
      }

      const to = lifi.address // should be a checksummed recipient address
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes from the current Unix time

      const iface = new utils.Interface([
        'function swapETHForExactTokens(uint256,address[],address,uint256)',
      ])

      // Generate swap data
      const uniswapData = iface.encodeFunctionData('swapETHForExactTokens', [
        utils.parseUnits('1000', 6),
        [wmatic.address, usdt.address],
        to,
        deadline,
      ])

      swapData = [
        {
          callTo: UNISWAP_ADDRESS,
          approveTo: UNISWAP_ADDRESS,
          sendingAssetId: ethers.constants.AddressZero,
          receivingAssetId: usdt.address,
          fromAmount: utils.parseEther('700'),
          callData: uniswapData,
          requiresDeposit: false,
        },
      ]

      const payloadIface = new utils.Interface([
        'function swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
      ])

      // Generate swap calldata
      const payloadUniswapData = payloadIface.encodeFunctionData(
        'swapExactTokensForETH',
        [
          utils.parseUnits('1000', 6),
          utils.parseEther('600'),
          [usdt.address, wmatic.address],
          to,
          deadline,
        ]
      )

      payloadSwapData = [
        {
          callTo: UNISWAP_ADDRESS,
          approveTo: UNISWAP_ADDRESS,
          sendingAssetId: usdt.address,
          receivingAssetId: ethers.constants.AddressZero,
          fromAmount: utils.parseUnits('1000', 6),
          callData: payloadUniswapData,
          requiresDeposit: false,
        },
      ]

      await usdt.approve(lifi.address, utils.parseUnits('1000', 6))
    }
  )

  before(async function () {
    this.timeout(0)
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: node_url('polygon'),
            blockNumber: 33418422,
          },
        },
      ],
    })
  })

  beforeEach(async () => {
    await setupTest()
  })

  describe('startBridgeTokensViaStargate function', () => {
    describe(`should be possible to starts a bridge transaction On ${SRC_CHAIN}`, () => {
      const chains: string[] = Object.keys(TEST_CHAINS)
      const tokenNames: string[] = Object.keys(POOLS)
      chains.forEach((chain: string) => {
        if (chain != SRC_CHAIN) {
          config[TEST_CHAINS[chain]].pools.forEach((pool: any) => {
            const tokenName = tokenNames.find(
              (token: string) => POOLS[token] == pool
            )
            it(`to send to ${tokenName} on ${chain}`, async () => {
              const bridgeData = {
                transactionId: utils.randomBytes(32),
                bridge: 'polygon',
                integrator: 'ACME Devs',
                referrer: ethers.constants.AddressZero,
                sendingAssetId: usdt.address,
                receiver: alice.address,
                minAmount: utils.parseUnits('1000', 6),
                destinationChainId: config[TEST_CHAINS[chain]].chainId,
                hasSourceSwaps: false,
                hasDestinationCall: false,
              }

              const stargateData = {
                ...testStargateData,
                dstPoolId: pool.id,
              }

              const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
              const requiredGasFee = quoteData[0]

              await expect(
                lifi
                  .connect(alice)
                  .startBridgeTokensViaStargate(bridgeData, stargateData, {
                    gasLimit: 500000,
                    value: requiredGasFee,
                  })
              ).to.emit(lifi, 'LiFiTransferStarted')
            })
          })
        }
      })
    })

    describe('should be reverted to starts a bridge transaction', () => {
      describe('when the destination is a same chain', () => {
        const tokenNames: string[] = Object.keys(POOLS)
        config[TEST_CHAINS[SRC_CHAIN]].pools.forEach((pool: any) => {
          const tokenName = tokenNames.find(
            (token: string) => POOLS[token] == pool
          )
          it(`sending to ${tokenName} on ${SRC_CHAIN} from ${SRC_CHAIN}`, async () => {
            const stargateData = {
              ...testStargateData,
              dstChainId: config[TEST_CHAINS[SRC_CHAIN]].layerZeroChainId,
              dstPoolId: pool.id,
            }

            const bridgeData = {
              transactionId: utils.randomBytes(32),
              bridge: 'polygon',
              integrator: 'ACME Devs',
              referrer: ethers.constants.AddressZero,
              sendingAssetId: usdt.address,
              receiver: alice.address,
              minAmount: utils.parseUnits('1000', 6),
              destinationChainId: SRC_CHAIN,
              hasSourceSwaps: false,
              hasDestinationCall: false,
            }

            await expect(lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)).to.be.reverted

            await expect(
              lifi
                .connect(alice)
                .startBridgeTokensViaStargate(bridgeData, stargateData, {
                  gasLimit: 500000,
                  value: utils.parseEther('10'),
                })
            ).to.be.revertedWith('Stargate: local chainPath does not exist')
          })
        })
      })

      it('when the destination chain is invalid', async () => {
        const stargateData = {
          ...testStargateData,
          dstChainId: 99999,
        }
        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: 99999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        await expect(lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)).to.be.reverted

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: utils.parseEther('10'),
            })
        ).to.be.reverted
      })

      it('when the destination token is invalid', async () => {
        const stargateData = {
          ...testStargateData,
          dstPoolId: 99999,
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: 99999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: requiredGasFee,
            })
        ).to.be.revertedWith('Stargate: local chainPath does not exist')
      })

      it('when the fee is low', async () => {
        const stargateData = testStargateData

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: 99999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: requiredGasFee.sub(1),
            })
        ).to.be.revertedWith('LayerZero: not enough native for fees')
      })

      it('when the sending amount is zero', async () => {
        const stargateData = {
          ...testStargateData,
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: 0,
          destinationChainId: 99999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: requiredGasFee,
            })
        ).to.be.revertedWith('InvalidAmount()')
      })

      it('when the receiving amount is less then minimum acceptable amount', async () => {
        const stargateData = {
          ...testStargateData,
          minAmountLD: utils.parseUnits('1000', 6),
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: 99999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: requiredGasFee.sub(1),
            })
        ).to.be.revertedWith('Stargate: slippage too high')
      })

      it('when the user does not have enough amount', async () => {
        const stargateData = {
          ...testStargateData,
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const usdtBalance = await usdt.balanceOf(alice.address)
        await usdt.transfer(lifi.address, usdtBalance)

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .startBridgeTokensViaStargate(bridgeData, stargateData, {
              gasLimit: 500000,
              value: requiredGasFee,
            })
        ).to.be.revertedWith('InsufficientBalance')
      })
    })
  })

  describe('swapAndStartBridgeTokensViaStargate function', () => {
    describe(`should be possible to perform a swap then starts a bridge transaction on ${SRC_CHAIN}`, () => {
      const chains: string[] = Object.keys(TEST_CHAINS)
      const tokenNames: string[] = Object.keys(POOLS)
      chains.forEach((chain: string) => {
        if (chain != SRC_CHAIN) {
          config[TEST_CHAINS[chain]].pools.forEach((pool: any) => {
            const tokenName = tokenNames.find(
              (token: string) => POOLS[token] == pool
            )
            it(`to send to ${tokenName} on ${chain}`, async () => {
              const bridgeData = {
                transactionId: utils.randomBytes(32),
                bridge: 'polygon',
                integrator: 'ACME Devs',
                referrer: ethers.constants.AddressZero,
                sendingAssetId: usdt.address,
                receiver: alice.address,
                minAmount: utils.parseUnits('1000', 6),
                destinationChainId: config[TEST_CHAINS[chain]].chainId,
                hasSourceSwaps: false,
                hasDestinationCall: false,
              }
              const stargateData = {
                ...testStargateData,
                dstChainId: config[TEST_CHAINS[chain]].layerZeroChainId,
                dstPoolId: pool.id,
              }

              const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
              const requiredGasFee = quoteData[0]

              await expect(
                lifi.connect(alice).swapAndStartBridgeTokensViaStargate(
                  {
                    ...bridgeData,
                    destinationChainId: config[TEST_CHAINS[chain]].chainId,
                  },
                  swapData,
                  stargateData,
                  {
                    gasLimit: 1000000,
                    value: utils.parseEther('700').add(requiredGasFee),
                  }
                )
              ).to.emit(lifi, 'LiFiTransferStarted')
            })
          })
        }
      })
    })

    describe('should be reverted to perform a swap then starts a bridge transaction', () => {
      describe('when the destination is a same chain', () => {
        const tokenNames: string[] = Object.keys(POOLS)
        config[TEST_CHAINS[SRC_CHAIN]].pools.forEach((pool: any) => {
          const tokenName = tokenNames.find(
            (token: string) => POOLS[token] == pool
          )
          it(`sending to ${tokenName} on ${SRC_CHAIN} from ${SRC_CHAIN}`, async () => {
            const stargateData = {
              ...testStargateData,
              dstChainId: config[TEST_CHAINS[SRC_CHAIN]].layerZeroChainId,
              dstPoolId: pool.id,
            }
            const bridgeData = {
              transactionId: utils.randomBytes(32),
              bridge: 'polygon',
              integrator: 'ACME Devs',
              referrer: ethers.constants.AddressZero,
              sendingAssetId: usdt.address,
              receiver: alice.address,
              minAmount: utils.parseUnits('1000', 6),
              destinationChainId: SRC_CHAIN,
              hasSourceSwaps: false,
              hasDestinationCall: false,
            }
            await expect(lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)).to.be.reverted

            await expect(
              lifi.connect(alice).swapAndStartBridgeTokensViaStargate(
                {
                  ...bridgeData,
                  destinationChainId: config[TEST_CHAINS[SRC_CHAIN]].chainId,
                },
                swapData,
                stargateData,
                {
                  gasLimit: 1000000,
                  value: utils.parseEther('700').add(utils.parseEther('10')),
                }
              )
            ).to.be.revertedWith('Stargate: local chainPath does not exist')
          })
        })
      })

      it('when the destination chain is invalid', async () => {
        const stargateData = {
          ...testStargateData,
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: 9999,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        await expect(lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)).to.be.reverted

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaStargate(
              bridgeData,
              swapData,
              stargateData,
              {
                gasLimit: 1000000,
                value: utils.parseEther('700').add(utils.parseEther('10')),
              }
            )
        ).to.be.reverted
      })

      it('when the destination token is invalid', async () => {
        const stargateData = {
          ...testStargateData,
          dstPoolId: 99999,
        }
        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }
        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaStargate(
              bridgeData,
              swapData,
              stargateData,
              {
                gasLimit: 1000000,
                value: utils.parseEther('700').add(requiredGasFee),
              }
            )
        ).to.be.revertedWith('Stargate: local chainPath does not exist')
      })

      it('when the fee is low', async () => {
        const stargateData = testStargateData

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaStargate(
              bridgeData,
              swapData,
              stargateData,
              {
                gasLimit: 1000000,
                value: utils.parseEther('700').add(requiredGasFee).sub(1),
              }
            )
        ).to.be.revertedWith('LayerZero: not enough native for fees')
      })

      it('when the receiving amount is less then minimum acceptable amount', async () => {
        const stargateData = {
          ...testStargateData,
          minAmountLD: utils.parseUnits('1000', 6),
        }

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaStargate(
              bridgeData,
              swapData,
              stargateData,
              {
                gasLimit: 1000000,
                value: utils.parseEther('700').add(requiredGasFee).sub(1),
              }
            )
        ).to.be.revertedWith('Stargate: slippage too high')
      })

      it('when the dex is not approved', async () => {
        await dexMgr.removeDex(UNISWAP_ADDRESS)

        const stargateData = testStargateData

        const quoteData = await lifi.quoteLayerZeroFee(bridgeData.destinationChainId, stargateData)
        const requiredGasFee = quoteData[0]

        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        await expect(
          lifi
            .connect(alice)
            .swapAndStartBridgeTokensViaStargate(
              bridgeData,
              swapData,
              stargateData,
              {
                gasLimit: 1000000,
                value: utils.parseEther('700').add(requiredGasFee),
              }
            )
        ).to.be.revertedWith('ContractCallNotAllowed()')
      })
    })
  })

  describe('sgReceive function', () => {
    describe('should be reverted to call sgReceive', () => {
      it('when sender is not stargate router', async () => {
        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }

        const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
          Object.values(bridgeData),
          [],
          POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
          alice.address,
        ])

        await expect(
          lifi.sgReceive(
            1,
            config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
            0,
            POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
            utils.parseUnits('1000', 6),
            payload
          )
        ).to.be.revertedWith('InvalidStargateRouter')
      })
    })

    describe('completeBridgeTokensViaStargate function', () => {
      describe('should be reverted to process completeBridgeTokensViaStargate', () => {
        it('when call completeBridgeTokensViaStargate directly', async () => {
          const bridgeData = {
            transactionId: utils.randomBytes(32),
            bridge: 'polygon',
            integrator: 'ACME Devs',
            referrer: ethers.constants.AddressZero,
            sendingAssetId: usdt.address,
            receiver: alice.address,
            minAmount: utils.parseUnits('1000', 6),
            destinationChainId: SRC_CHAIN,
            hasSourceSwaps: false,
            hasDestinationCall: false,
          }
          await expect(
            lifi
              .connect(bob)
              .completeBridgeTokensViaStargate(
                bridgeData,
                usdt.address,
                alice.address,
                utils.parseUnits('1000', 6)
              )
          ).to.be.revertedWith('InvalidCaller()')
        })

        it('when asset id is invalid', async () => {
          const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
            Object.values(bridgeData),
            [],
            ethers.constants.AddressZero,
            alice.address,
          ])
          const bridgeData = {
            transactionId: utils.randomBytes(32),
            bridge: 'polygon',
            integrator: 'ACME Devs',
            referrer: ethers.constants.AddressZero,
            sendingAssetId: usdt.address,
            receiver: alice.address,
            minAmount: utils.parseUnits('1000', 6),
            destinationChainId: SRC_CHAIN,
            hasSourceSwaps: false,
            hasDestinationCall: false,
          }
          await expect(
            lifi
              .connect(bob)
              .sgReceive(
                1,
                config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
                0,
                POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
                utils.parseUnits('1000', 6),
                payload
              )
          ).to.be.revertedWith('NativeAssetTransferFailed()')
        })

        it('when token arrived amount is low', async () => {
          const bridgeData = {
            transactionId: utils.randomBytes(32),
            bridge: 'polygon',
            integrator: 'ACME Devs',
            referrer: ethers.constants.AddressZero,
            sendingAssetId: usdt.address,
            receiver: alice.address,
            minAmount: utils.parseUnits('1000', 6),
            destinationChainId: SRC_CHAIN,
            hasSourceSwaps: false,
            hasDestinationCall: false,
          }
          const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
            Object.values(bridgeData),
            [],
            WMATIC_ADDRESS,
            alice.address,
          ])
          await expect(
            lifi
              .connect(bob)
              .sgReceive(
                1,
                config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
                0,
                WMATIC_ADDRESS,
                utils.parseUnits('1000', 6),
                payload
              )
          ).to.be.revertedWith('SafeERC20: low-level call failed')
        })
      })

      it('should be possible to process completeBridgeTokensViaStargate', async () => {
        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }
        const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
          Object.values(bridgeData),
          [],
          POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
          alice.address,
        ])
        await usdt.transfer(lifi.address, utils.parseUnits('1000', 6))

        await expect(
          lifi
            .connect(bob)
            .sgReceive(
              1,
              config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
              0,
              POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
              utils.parseUnits('1000', 6),
              payload
            )
        ).to.emit(lifi, 'LiFiTransferCompleted')
      })
    })

    describe('swapAndCompleteBridgeTokensViaStargate function', () => {
      describe('should be reverted to process swapAndCompleteBridgeTokensViaStargate', () => {
        it('when call swapAndCompleteBridgeTokensViaStargate directly', async () => {
          const bridgeData = {
            transactionId: utils.randomBytes(32),
            bridge: 'polygon',
            integrator: 'ACME Devs',
            referrer: ethers.constants.AddressZero,
            sendingAssetId: usdt.address,
            receiver: alice.address,
            minAmount: utils.parseUnits('1000', 6),
            destinationChainId: SRC_CHAIN,
            hasSourceSwaps: false,
            hasDestinationCall: false,
          }
          await expect(
            lifi
              .connect(bob)
              .swapAndCompleteBridgeTokensViaStargate(
                bridgeData,
                payloadSwapData,
                usdt.address,
                alice.address
              )
          ).to.be.revertedWith('InvalidCaller()')
        })

        it('when token arrived amount is low', async () => {
          const bridgeData = {
            transactionId: utils.randomBytes(32),
            bridge: 'polygon',
            integrator: 'ACME Devs',
            referrer: ethers.constants.AddressZero,
            sendingAssetId: usdt.address,
            receiver: alice.address,
            minAmount: utils.parseUnits('1000', 6),
            destinationChainId: SRC_CHAIN,
            hasSourceSwaps: false,
            hasDestinationCall: false,
          }
          const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
            Object.values(bridgeData),
            payloadSwapData.map((data: any) => Object.values(data)),
            ethers.constants.AddressZero,
            alice.address,
          ])
          await expect(
            lifi
              .connect(bob)
              .sgReceive(
                1,
                config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
                0,
                ethers.constants.AddressZero,
                utils.parseUnits('1000', 6),
                payload
              )
          ).to.be.revertedWith('ERC20: transfer amount exceeds balance')
        })
      })

      it('should be possible to process swapAndCompleteBridgeTokensViaStargate', async () => {
        const bridgeData = {
          transactionId: utils.randomBytes(32),
          bridge: 'polygon',
          integrator: 'ACME Devs',
          referrer: ethers.constants.AddressZero,
          sendingAssetId: usdt.address,
          receiver: alice.address,
          minAmount: utils.parseUnits('1000', 6),
          destinationChainId: SRC_CHAIN,
          hasSourceSwaps: false,
          hasDestinationCall: false,
        }
        const payload = ethers.utils.defaultAbiCoder.encode(PAYLOAD_ABI, [
          Object.values(bridgeData),
          payloadSwapData.map((data: any) => Object.values(data)),
          ethers.constants.AddressZero,
          alice.address,
        ])
        await usdt.transfer(lifi.address, utils.parseUnits('1000', 6))
        await expect(
          lifi
            .connect(bob)
            .sgReceive(
              1,
              config[TEST_CHAINS[SRC_CHAIN]].stargateRouter,
              0,
              POOLS[SRC_ASSET][TEST_CHAINS[SRC_CHAIN]],
              utils.parseUnits('1000', 6),
              payload
            )
        ).to.emit(lifi, 'LiFiTransferCompleted')
      })
    })
  })
})
