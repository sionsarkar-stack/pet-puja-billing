import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ContractorManager from './ContractorManager'

type TestContractor = {
    id: number
    name: string
    phoneNumber: string
    address: string | null
    contractType: string | null
    description: string | null
}

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

describe('ContractorManager', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('saves, lists, edits, filters, and removes contractor details', async () => {
        let contractors: TestContractor[] = []
        const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
            const url = String(input)
            const method = init?.method ?? 'GET'
            if (url === '/api/contractors' && method === 'GET') return jsonResponse(contractors)
            if (url === '/api/contractors' && method === 'POST') {
                const payload = JSON.parse(String(init?.body)) as Omit<TestContractor, 'id'>
                const saved = { id: 1, ...payload }
                contractors = [saved]
                return jsonResponse(saved, 201)
            }
            if (url === '/api/contractors/1' && method === 'PUT') {
                const payload = JSON.parse(String(init?.body)) as Omit<TestContractor, 'id'>
                const saved = { id: 1, ...payload }
                contractors = [saved]
                return jsonResponse(saved)
            }
            if (url === '/api/contractors/1' && method === 'DELETE') {
                contractors = []
                return new Response(null, { status: 204 })
            }
            return jsonResponse({ message: 'Not found' }, 404)
        })
        vi.stubGlobal('fetch', fetchMock)
        const user = userEvent.setup()

        render(<ContractorManager canManage />)

        const name = await screen.findByLabelText('Name')
        const phone = screen.getByLabelText('Phone number')
        expect(name).toBeRequired()
        expect(phone).toBeRequired()
        await user.type(name, 'Asha Contractor')
        await user.type(phone, '+1 555 010 9999')
        await user.type(screen.getByLabelText('Address'), 'North Road')
        await user.type(screen.getByLabelText('Contract type'), 'Plumbing')
        await user.type(screen.getByLabelText('Description'), 'Kitchen repairs')
        await user.click(screen.getByRole('button', { name: 'Add contractor' }))

        const contractorTable = await screen.findByRole('table', { name: 'Contractor details' })
        expect(within(contractorTable).getByText('Asha Contractor')).toBeInTheDocument()
        expect(within(contractorTable).getByText('+1 555 010 9999')).toBeInTheDocument()
        expect(within(contractorTable).getByText('Kitchen repairs')).toBeInTheDocument()

        await user.click(within(contractorTable).getByRole('button', { name: 'Edit Asha Contractor' }))
        await user.clear(screen.getByLabelText('Contract type'))
        await user.type(screen.getByLabelText('Contract type'), 'Electrical')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(await within(contractorTable).findByText('Electrical')).toBeInTheDocument()

        await user.type(screen.getByRole('searchbox', { name: 'Search contractors' }), 'plumbing')
        expect(screen.getByText('No contractors match this search.')).toBeInTheDocument()
        await user.clear(screen.getByRole('searchbox', { name: 'Search contractors' }))

        const refreshedTable = screen.getByRole('table', { name: 'Contractor details' })
        await user.click(within(refreshedTable).getByRole('button', { name: 'Remove Asha Contractor' }))
        const confirmation = screen.getByRole('alertdialog', { name: 'Remove contractor' })
        await user.click(within(confirmation).getByRole('button', { name: 'Remove contractor' }))
        expect(await screen.findByText('No contractors have been saved yet.')).toBeInTheDocument()
    })

    it('shows saved contractor rows without write controls for captains', async () => {
        vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse([{
            id: 1,
            name: 'Asha Contractor',
            phoneNumber: '9876543210',
            address: null,
            contractType: null,
            description: null,
        }])))

        render(<ContractorManager />)

        const table = await screen.findByRole('table', { name: 'Contractor details' })
        expect(within(table).getByText('Asha Contractor')).toBeInTheDocument()
        expect(screen.queryByRole('form', { name: 'Add contractor' })).not.toBeInTheDocument()
        expect(within(table).queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    })
})